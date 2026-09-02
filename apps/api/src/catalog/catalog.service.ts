import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  displayUnknown,
  resolveWorkAccess,
  type AccessLevel,
  type AccessSectionInput,
} from "@film-bot/contracts";
import type { Database } from "@film-bot/database";
import {
  contentSections,
  contentUnits,
  mediaAssets,
  systemSettings,
  works,
} from "@film-bot/database";
import { asc, desc, eq, inArray } from "drizzle-orm";

import { MembershipCtaService } from "../membership/membership-cta.service.js";
import { MediaSigningService } from "../media/media-signing.service.js";
import { DATABASE_CONNECTION } from "../tokens.js";

type WorkRow = typeof works.$inferSelect;
type SectionRow = typeof contentSections.$inferSelect;
type UnitRow = typeof contentUnits.$inferSelect;
type CoverRow = typeof mediaAssets.$inferSelect;

interface CatalogContext {
  membershipEnabled: boolean;
  membershipCtaText: string;
}

@Injectable()
export class CatalogService {
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
    @Inject(MediaSigningService) private readonly mediaSigning: MediaSigningService,
    @Inject(MembershipCtaService) private readonly membershipCta: MembershipCtaService,
  ) {}

  public async listWorks(input: {
    userId: string;
    memberActive: boolean;
    limit: number;
    cursor: string | null;
    type?: WorkRow["type"] | null;
    query?: string | null;
    sourcePlacement?: string;
    recommendationRequestId?: string;
  }) {
    const publishedRows = await this.database
      .select()
      .from(works)
      .where(eq(works.publicationStatus, "published"))
      .orderBy(asc(works.sortOrder), desc(works.publishedAt), asc(works.id))
      .limit(200);
    const normalizedQuery = input.query?.trim().toLocaleLowerCase() ?? "";
    const workRows = publishedRows.filter(
      (work) =>
        (!input.type || work.type === input.type) &&
        (!normalizedQuery ||
          work.title.toLocaleLowerCase().includes(normalizedQuery) ||
          work.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery)) ||
          work.tags.some((tag) => tag.toLocaleLowerCase().includes(normalizedQuery))),
    );
    const start = input.cursor
      ? Math.max(0, workRows.findIndex((work) => work.id === input.cursor) + 1)
      : 0;
    const page = workRows.slice(start, start + input.limit);
    const hydrated = await this.hydrate(page);
    const context = await this.catalogContext();
    const items = await Promise.all(
      page
        .filter((work) => hydrated.covers.has(work.publicCoverAssetId ?? ""))
        .map(async (work) => {
          const detail = await this.toWorkDetail(
            work,
            hydrated.sectionsByWork.get(work.id) ?? [],
            hydrated.unitsBySection,
            hydrated.covers,
            context,
            input.userId,
            input.memberActive,
            input.sourcePlacement ?? "catalog",
            input.recommendationRequestId,
          );
          if (detail.accessState === "locked") return detail;
          const { sections, ...summary } = detail;
          void sections;
          return summary;
        }),
    );
    const last = page.at(-1);
    return {
      items,
      nextCursor: start + input.limit < workRows.length && last ? last.id : null,
    };
  }

  public async listSelectedWorks(input: {
    userId: string;
    memberActive: boolean;
    workIds: string[];
    sourcePlacement: string;
  }) {
    if (input.workIds.length === 0) return [];
    const rows = await this.database.select().from(works).where(inArray(works.id, input.workIds));
    const byId = new Map(rows.map((work) => [work.id, work]));
    const ordered = input.workIds.flatMap((id) => {
      const work = byId.get(id);
      return work?.publicationStatus === "published" ? [work] : [];
    });
    const hydrated = await this.hydrate(ordered);
    const context = await this.catalogContext();
    return Promise.all(
      ordered
        .filter((work) => hydrated.covers.has(work.publicCoverAssetId ?? ""))
        .map(async (work) => {
          const detail = await this.toWorkDetail(
            work,
            hydrated.sectionsByWork.get(work.id) ?? [],
            hydrated.unitsBySection,
            hydrated.covers,
            context,
            input.userId,
            input.memberActive,
            input.sourcePlacement,
            undefined,
          );
          if (detail.accessState === "locked") return detail;
          const { sections, ...summary } = detail;
          void sections;
          return summary;
        }),
    );
  }

  public async getWork(input: { userId: string; memberActive: boolean; workId: string }) {
    const [work] = await this.database
      .select()
      .from(works)
      .where(eq(works.id, input.workId))
      .limit(1);
    if (!work || work.publicationStatus !== "published") {
      throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });
    }
    const hydrated = await this.hydrate([work]);
    if (!hydrated.covers.has(work.publicCoverAssetId ?? "")) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "作品公开封面不可用" });
    }
    return this.toWorkDetail(
      work,
      hydrated.sectionsByWork.get(work.id) ?? [],
      hydrated.unitsBySection,
      hydrated.covers,
      await this.catalogContext(),
      input.userId,
      input.memberActive,
      "work_detail",
    );
  }

  private async hydrate(workRows: readonly WorkRow[]) {
    const workIds = workRows.map((work) => work.id);
    const coverIds = workRows
      .map((work) => work.publicCoverAssetId)
      .filter((id): id is string => id !== null);
    if (workIds.length === 0) {
      return {
        sectionsByWork: new Map<string, SectionRow[]>(),
        unitsBySection: new Map<string, UnitRow[]>(),
        covers: new Map<string, CoverRow>(),
      };
    }
    const sectionRows = await this.database
      .select()
      .from(contentSections)
      .where(inArray(contentSections.workId, workIds))
      .orderBy(asc(contentSections.sortOrder));
    const sectionIds = sectionRows.map((section) => section.id);
    const unitRows =
      sectionIds.length === 0
        ? []
        : await this.database
            .select()
            .from(contentUnits)
            .where(inArray(contentUnits.sectionId, sectionIds))
            .orderBy(asc(contentUnits.ordinal));
    const coverRows =
      coverIds.length === 0
        ? []
        : await this.database.select().from(mediaAssets).where(inArray(mediaAssets.id, coverIds));

    return {
      sectionsByWork: groupBy(sectionRows, (section) => section.workId),
      unitsBySection: groupBy(unitRows, (unit) => unit.sectionId),
      covers: new Map(coverRows.map((cover) => [cover.id, cover])),
    };
  }

  private async catalogContext(): Promise<CatalogContext> {
    const [settings] = await this.database
      .select({
        membershipEnabled: systemSettings.membershipEnabled,
        membershipCtaText: systemSettings.membershipCtaText,
      })
      .from(systemSettings)
      .limit(1);
    return {
      membershipEnabled: settings?.membershipEnabled ?? true,
      membershipCtaText: settings?.membershipCtaText ?? "开通会员",
    };
  }

  private async toWorkDetail(
    work: WorkRow,
    sections: readonly SectionRow[],
    unitsBySection: ReadonlyMap<string, UnitRow[]>,
    covers: ReadonlyMap<string, CoverRow>,
    context: CatalogContext,
    userId: string,
    memberActive: boolean,
    sourcePlacement: string,
    recommendationRequestId?: string,
  ) {
    const accessSections: AccessSectionInput[] = sections.map((section) => ({
      id: section.id,
      accessLevel: section.accessLevel as AccessLevel | null,
      publicationStatus: section.publicationStatus,
      units: (unitsBySection.get(section.id) ?? []).map((unit) => ({
        id: unit.id,
        accessLevel: unit.accessLevel as AccessLevel | null,
        publicationStatus: unit.publicationStatus,
      })),
    }));
    const access = resolveWorkAccess({
      workAccessLevel: work.accessLevel as AccessLevel | null,
      membershipEnabled: context.membershipEnabled,
      memberActive,
      sections: accessSections,
    });
    const cover = covers.get(work.publicCoverAssetId ?? "");
    if (!cover) throw new Error(`Published work ${work.id} has no usable public cover`);
    const publicCover = {
      assetId: cover.id,
      url: this.mediaSigning.createPublicCoverUrl(cover.id),
      width: cover.width,
      height: cover.height,
    };
    const base = {
      id: work.id,
      type: work.type,
      subtype: work.subtype,
      title: work.title,
      summary: work.summary,
      accessLevel: work.accessLevel,
      accessState: access.state,
      publicCover,
      metadata: workMetadata(work),
      memberBadge: access.containsMemberContent,
    };
    const needsCta = context.membershipEnabled && !memberActive && access.state !== "full";
    const membershipCta = needsCta
      ? await this.membershipCta.create({
          userId,
          workId: work.id,
          sourcePlacement,
          label: context.membershipCtaText,
          ...(recommendationRequestId ? { recommendationRequestId } : {}),
        })
      : undefined;

    if (access.state === "locked") {
      if (!membershipCta) throw new Error("Locked work requires a membership CTA");
      return {
        ...base,
        accessState: "locked" as const,
        memberBadge: true as const,
        membershipCta,
      };
    }

    const sectionMap = new Map(sections.map((section) => [section.id, section]));
    const unitMap = new Map(
      [...unitsBySection.values()].flatMap((units) => units).map((unit) => [unit.id, unit]),
    );
    return {
      ...base,
      accessState: access.state,
      containsMemberContent: access.containsMemberContent,
      sections: access.visibleSections.flatMap((visibleSection) => {
        const section = sectionMap.get(visibleSection.id);
        if (!section) return [];
        return [
          {
            id: section.id,
            type: section.type,
            title: section.title,
            ordinal: section.sortOrder,
            units: visibleSection.units.flatMap((visibleUnit) => {
              const unit = unitMap.get(visibleUnit.id);
              if (!unit) return [];
              return [
                {
                  id: unit.id,
                  type: unit.type,
                  title: unit.title,
                  ordinal: unit.ordinal,
                  accessLevel: unit.accessLevel,
                  publicationStatus: unit.publicationStatus,
                },
              ];
            }),
          },
        ];
      }),
      ...(membershipCta ? { membershipCta } : {}),
    };
  }
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    const group = groups.get(groupKey) ?? [];
    group.push(row);
    groups.set(groupKey, group);
  }
  return groups;
}

function valueList(values: string[]): string[] {
  return values.length > 0 ? values : ["未知"];
}

function workMetadata(work: WorkRow) {
  return {
    originalTitle: displayUnknown(work.originalTitle),
    aliases: valueList(work.aliases),
    region: displayUnknown(work.region),
    year: work.releaseYear ?? ("未知" as const),
    releaseDate: displayUnknown(work.releaseDate),
    language: displayUnknown(work.language),
    tags: valueList(work.tags),
    releaseStatus: displayUnknown(work.releaseStatus),
    contentRating: displayUnknown(work.contentRating),
    directors: valueList(work.directors),
    actors: valueList(work.actors),
    screenwriters: valueList(work.screenwriters),
    producers: valueList(work.producers),
    productionCompanies: valueList(work.productionCompanies),
    totalEpisodes: work.totalEpisodes ?? ("未知" as const),
    durationSeconds: work.durationSeconds ?? ("未知" as const),
    authors: valueList(work.authors),
    originalAuthors: valueList(work.originalAuthors),
    artists: valueList(work.artists),
    publisher: displayUnknown(work.publisher),
    serializationPlatform: displayUnknown(work.serializationPlatform),
    serializationStatus: displayUnknown(work.serializationStatus),
    photographers: valueList(work.photographers),
    subjects: valueList(work.subjects),
    studio: displayUnknown(work.studio),
    shootDate: displayUnknown(work.shootDate),
    location: displayUnknown(work.location),
    volumeCount: work.volumeCount ?? ("未知" as const),
  };
}
