import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Database } from "@film-bot/database";
import {
  contentEvents,
  contentSections,
  contentUnits,
  favorites,
  mediaAssets,
  readingProgress,
  recommendationRequests,
  systemSettings,
  userInterestProfiles,
  users,
  works,
} from "@film-bot/database";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { CatalogService } from "../catalog/catalog.service.js";
import { MediaSigningService } from "../media/media-signing.service.js";
import { DATABASE_CONNECTION } from "../tokens.js";

type WorkType = typeof works.$inferSelect.type;
type UnitType = typeof contentUnits.$inferSelect.type;
type AccessLevel = "public" | "member" | null;

interface ProgressInput {
  progressType: "gallery" | "comic";
  currentPage: number;
  totalPages: number;
  scrollAnchor: string | null;
  readingMode: "continuous" | "paged";
  pageLayout: "single" | "double";
  readingDirection: "ltr" | "rtl";
  idempotencyKey: string;
}

interface UnitAccessRow {
  unitId: string;
  unitTitle: string;
  unitType: UnitType;
  unitAccessLevel: AccessLevel;
  unitStatus: "draft" | "published" | "withdrawn";
  sectionId: string;
  sectionAccessLevel: AccessLevel;
  sectionStatus: "draft" | "published" | "withdrawn";
  workId: string;
  workTitle: string;
  workType: WorkType;
  workAccessLevel: AccessLevel;
  workStatus: "draft" | "published" | "withdrawn";
  workTags: string[];
  publicCoverAssetId: string | null;
}

@Injectable()
export class ContentService {
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(MediaSigningService) private readonly signing: MediaSigningService,
  ) {}

  public async getImageManifest(input: { userId: string; memberActive: boolean; unitId: string }) {
    const unit = await this.assertUnitAccess(input.unitId, input.memberActive);
    if (!isImageUnit(unit.unitType)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "当前内容单元不是图片内容",
      });
    }
    const assets = await this.database
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.unitId, input.unitId), eq(mediaAssets.status, "available")))
      .orderBy(asc(mediaAssets.ordinal));
    const groups = groupImages(assets);
    const [progress] = await this.database
      .select()
      .from(readingProgress)
      .where(
        and(eq(readingProgress.userId, input.userId), eq(readingProgress.unitId, input.unitId)),
      )
      .limit(1);

    return {
      unit: {
        id: unit.unitId,
        workId: unit.workId,
        title: unit.unitTitle,
        type: unit.unitType,
      },
      images: groups.map(({ logicalAssetId, ordinal, browse, thumbnail }) => ({
        logicalAssetId,
        ordinal,
        browse: this.imageSummary(browse, input.userId),
        thumbnail: thumbnail ? this.imageSummary(thumbnail, input.userId) : null,
      })),
      progress: progress ? progressDto(progress) : null,
    };
  }

  public async saveProgress(input: {
    userId: string;
    memberActive: boolean;
    unitId: string;
    progress: ProgressInput;
  }) {
    const unit = await this.assertUnitAccess(input.unitId, input.memberActive);
    if (!isImageUnit(unit.unitType)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "内容类型不支持阅读进度",
      });
    }
    const expectedType = unit.unitType === "comic_chapter" ? "comic" : "gallery";
    if (input.progress.progressType !== expectedType) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "阅读进度类型不匹配" });
    }
    const browseAssets = await this.database
      .select({ logicalAssetId: mediaAssets.logicalAssetId })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.unitId, input.unitId),
          eq(mediaAssets.status, "available"),
          eq(mediaAssets.variant, "browse"),
        ),
      );
    const totalPages = new Set(
      browseAssets.flatMap((asset) => (asset.logicalAssetId ? [asset.logicalAssetId] : [])),
    ).size;
    if (totalPages === 0 || input.progress.currentPage >= totalPages) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "阅读页码超出范围" });
    }

    const [saved] = await this.database
      .insert(readingProgress)
      .values({
        userId: input.userId,
        unitId: input.unitId,
        progressType: expectedType,
        currentPage: input.progress.currentPage,
        totalPages,
        scrollAnchor: input.progress.scrollAnchor,
        readingMode: input.progress.readingMode,
        pageLayout: input.progress.pageLayout,
        readingDirection: input.progress.readingDirection,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [readingProgress.userId, readingProgress.unitId],
        set: {
          currentPage: input.progress.currentPage,
          totalPages,
          scrollAnchor: input.progress.scrollAnchor,
          readingMode: input.progress.readingMode,
          pageLayout: input.progress.pageLayout,
          readingDirection: input.progress.readingDirection,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!saved) throw new Error("Reading progress upsert returned no row");

    await this.database
      .insert(contentEvents)
      .values({
        userId: input.userId,
        workId: unit.workId,
        unitId: input.unitId,
        eventType: "reading",
        weight: "1",
        source: "reading_progress",
        idempotencyKey: input.progress.idempotencyKey,
      })
      .onConflictDoNothing();
    await this.updateInterestProfile(input.userId, unit.workType, unit.workTags, 0.35);
    return progressDto(saved);
  }

  public async listFavorites(input: { userId: string; memberActive: boolean }) {
    const rows = await this.database
      .select({ workId: favorites.workId })
      .from(favorites)
      .where(eq(favorites.userId, input.userId))
      .orderBy(desc(favorites.createdAt));
    return this.catalog.listSelectedWorks({
      userId: input.userId,
      memberActive: input.memberActive,
      workIds: rows.map((row) => row.workId),
      sourcePlacement: "favorites",
    });
  }

  public async setFavorite(input: {
    userId: string;
    workId: string;
    idempotencyKey: string;
    favorite: boolean;
  }) {
    const [work] = await this.database
      .select({ id: works.id, type: works.type, tags: works.tags })
      .from(works)
      .where(and(eq(works.id, input.workId), eq(works.publicationStatus, "published")))
      .limit(1);
    if (!work) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });

    if (input.favorite) {
      await this.database
        .insert(favorites)
        .values({ userId: input.userId, workId: input.workId })
        .onConflictDoNothing();
    } else {
      await this.database
        .delete(favorites)
        .where(and(eq(favorites.userId, input.userId), eq(favorites.workId, input.workId)));
    }
    await this.database
      .insert(contentEvents)
      .values({
        userId: input.userId,
        workId: input.workId,
        eventType: input.favorite ? "favorite" : "unfavorite",
        weight: input.favorite ? "3" : "-1",
        source: "favorites",
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing();
    await this.updateInterestProfile(input.userId, work.type, work.tags, input.favorite ? 1 : -0.2);
    return { workId: input.workId, favorite: input.favorite };
  }

  public async listHistory(input: { userId: string; memberActive: boolean }) {
    const rows = await this.database
      .select({
        progress: readingProgress,
        unitId: contentUnits.id,
        unitTitle: contentUnits.title,
        unitAccessLevel: contentUnits.accessLevel,
        unitStatus: contentUnits.publicationStatus,
        sectionAccessLevel: contentSections.accessLevel,
        sectionStatus: contentSections.publicationStatus,
        workId: works.id,
        workTitle: works.title,
        workType: works.type,
        workAccessLevel: works.accessLevel,
        workStatus: works.publicationStatus,
        publicCoverAssetId: works.publicCoverAssetId,
      })
      .from(readingProgress)
      .innerJoin(contentUnits, eq(contentUnits.id, readingProgress.unitId))
      .innerJoin(contentSections, eq(contentSections.id, contentUnits.sectionId))
      .innerJoin(works, eq(works.id, contentSections.workId))
      .where(eq(readingProgress.userId, input.userId))
      .orderBy(desc(readingProgress.updatedAt))
      .limit(50);
    const context = await this.catalogContext();
    const visible = rows.filter(
      (row) =>
        row.unitStatus === "published" &&
        row.sectionStatus === "published" &&
        row.workStatus === "published" &&
        canAccess(
          row.unitAccessLevel,
          row.sectionAccessLevel,
          row.workAccessLevel,
          context.membershipEnabled,
          input.memberActive,
        ),
    );
    const coverIds = visible.flatMap((row) =>
      row.publicCoverAssetId ? [row.publicCoverAssetId] : [],
    );
    const covers =
      coverIds.length === 0
        ? []
        : await this.database.select().from(mediaAssets).where(inArray(mediaAssets.id, coverIds));
    const coverMap = new Map(covers.map((cover) => [cover.id, cover]));
    return visible.flatMap((row) => {
      const cover = coverMap.get(row.publicCoverAssetId ?? "");
      if (!cover) return [];
      return [
        {
          workId: row.workId,
          workTitle: row.workTitle,
          workType: row.workType,
          publicCover: {
            assetId: cover.id,
            url: this.signing.createPublicCoverUrl(cover.id),
            width: cover.width,
            height: cover.height,
          },
          unitId: row.unitId,
          unitTitle: row.unitTitle,
          progress: progressDto(row.progress),
        },
      ];
    });
  }

  public async recommendations(input: {
    userId: string;
    memberActive: boolean;
    placement: "recommendations" | "rankings";
  }) {
    const recommendationRequestId = randomUUID();
    const [profile] = await this.database
      .select()
      .from(userInterestProfiles)
      .where(eq(userInterestProfiles.userId, input.userId))
      .limit(1);
    const context = await this.catalogContext();
    const result = await this.catalog.listWorks({
      userId: input.userId,
      memberActive: input.memberActive,
      limit: 50,
      cursor: null,
      type: null,
      query: null,
      sourcePlacement: input.placement,
      recommendationRequestId,
    });
    const heatRows = await this.database
      .select({ workId: contentEvents.workId, heat: sql<number>`count(*)::int` })
      .from(contentEvents)
      .groupBy(contentEvents.workId);
    const heat = new Map(heatRows.map((row) => [row.workId, Number(row.heat)]));
    const coldStart =
      !profile ||
      (!profile.coldStartComplete &&
        Object.keys(profile.typeWeights).length === 0 &&
        Object.keys(profile.tagWeights).length === 0);
    const scored = result.items
      .map((work) => ({
        work,
        score: scoreWork(
          work,
          profile?.typeWeights ?? {},
          profile?.tagWeights ?? {},
          heat.get(work.id) ?? 0,
          input.placement,
        ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.work.title.localeCompare(right.work.title),
      );
    const algorithmVersion = profile?.algorithmVersion ?? context.recommendationVersion;
    await this.database.insert(recommendationRequests).values({
      id: recommendationRequestId,
      userId: input.userId,
      placement: input.placement,
      algorithmVersion,
      workIds: scored.map((item) => item.work.id),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return {
      recommendationRequestId,
      algorithmVersion,
      coldStart,
      items: scored.slice(0, 20).map((item, index) => ({
        rank: index + 1,
        score: Math.round(item.score * 1000) / 1000,
        work: item.work,
      })),
    };
  }

  public async recordRecommendationEvent(input: {
    userId: string;
    eventType: "impression" | "click";
    workId: string;
    recommendationRequestId: string;
    placement: "recommendations" | "rankings";
    idempotencyKey: string;
  }) {
    const [request] = await this.database
      .select()
      .from(recommendationRequests)
      .where(
        and(
          eq(recommendationRequests.id, input.recommendationRequestId),
          eq(recommendationRequests.userId, input.userId),
          eq(recommendationRequests.placement, input.placement),
          gte(recommendationRequests.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!request || !request.workIds.includes(input.workId)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "推荐结果归属校验失败",
      });
    }
    const [event] = await this.database
      .insert(contentEvents)
      .values({
        userId: input.userId,
        workId: input.workId,
        eventType: input.eventType,
        weight: input.eventType === "click" ? "1" : "0.1",
        recommendationRequestId: input.recommendationRequestId,
        source: input.placement,
        placement: input.placement,
        algorithmVersion: request.algorithmVersion,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning({ id: contentEvents.id });
    if (event && input.eventType === "click") {
      const [work] = await this.database
        .select({ type: works.type, tags: works.tags })
        .from(works)
        .where(eq(works.id, input.workId));
      if (work) await this.updateInterestProfile(input.userId, work.type, work.tags, 0.2);
    }
    return { recorded: Boolean(event) };
  }

  public async getProtectedImageAsset(assetId: string, userId: string) {
    const [user] = await this.database
      .select({
        status: users.status,
        memberActive: users.memberActive,
        expiresAt: users.memberExpiresAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user || user.status !== "active") {
      throw new NotFoundException({ code: "NOT_FOUND", message: "图片不存在" });
    }
    const [row] = await this.database
      .select({
        asset: mediaAssets,
        unitAccessLevel: contentUnits.accessLevel,
        unitStatus: contentUnits.publicationStatus,
        sectionAccessLevel: contentSections.accessLevel,
        sectionStatus: contentSections.publicationStatus,
        workAccessLevel: works.accessLevel,
        workStatus: works.publicationStatus,
      })
      .from(mediaAssets)
      .innerJoin(contentUnits, eq(contentUnits.id, mediaAssets.unitId))
      .innerJoin(contentSections, eq(contentSections.id, contentUnits.sectionId))
      .innerJoin(works, eq(works.id, contentSections.workId))
      .where(eq(mediaAssets.id, assetId))
      .limit(1);
    const context = await this.catalogContext();
    const membershipValid =
      user.memberActive && (!user.expiresAt || user.expiresAt.getTime() > Date.now());
    if (
      !row ||
      row.asset.status !== "available" ||
      (row.asset.variant !== "browse" && row.asset.variant !== "thumbnail") ||
      row.unitStatus !== "published" ||
      row.sectionStatus !== "published" ||
      row.workStatus !== "published" ||
      !canAccess(
        row.unitAccessLevel,
        row.sectionAccessLevel,
        row.workAccessLevel,
        context.membershipEnabled,
        membershipValid,
      )
    ) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "图片不存在" });
    }
    return row.asset;
  }

  private async assertUnitAccess(unitId: string, memberActive: boolean): Promise<UnitAccessRow> {
    const [row] = await this.database
      .select({
        unitId: contentUnits.id,
        unitTitle: contentUnits.title,
        unitType: contentUnits.type,
        unitAccessLevel: contentUnits.accessLevel,
        unitStatus: contentUnits.publicationStatus,
        sectionId: contentSections.id,
        sectionAccessLevel: contentSections.accessLevel,
        sectionStatus: contentSections.publicationStatus,
        workId: works.id,
        workTitle: works.title,
        workType: works.type,
        workAccessLevel: works.accessLevel,
        workStatus: works.publicationStatus,
        workTags: works.tags,
        publicCoverAssetId: works.publicCoverAssetId,
      })
      .from(contentUnits)
      .innerJoin(contentSections, eq(contentSections.id, contentUnits.sectionId))
      .innerJoin(works, eq(works.id, contentSections.workId))
      .where(eq(contentUnits.id, unitId))
      .limit(1);
    if (
      !row ||
      row.unitStatus !== "published" ||
      row.sectionStatus !== "published" ||
      row.workStatus !== "published"
    ) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "内容单元不存在" });
    }
    const context = await this.catalogContext();
    if (
      !canAccess(
        row.unitAccessLevel,
        row.sectionAccessLevel,
        row.workAccessLevel,
        context.membershipEnabled,
        memberActive,
      )
    ) {
      throw new ForbiddenException({ code: "MEMBERSHIP_REQUIRED", message: "需要会员权限" });
    }
    return row;
  }

  private imageSummary(asset: typeof mediaAssets.$inferSelect, userId: string) {
    return {
      assetId: asset.id,
      url: this.signing.createProtectedImageUrl(asset.id, userId),
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
    };
  }

  private async catalogContext() {
    const [settings] = await this.database
      .select({
        membershipEnabled: systemSettings.membershipEnabled,
        recommendationVersion: systemSettings.recommendationVersion,
      })
      .from(systemSettings)
      .limit(1);
    return {
      membershipEnabled: settings?.membershipEnabled ?? true,
      recommendationVersion: settings?.recommendationVersion ?? "mvp-v1",
    };
  }

  private async updateInterestProfile(
    userId: string,
    workType: WorkType,
    tags: string[],
    delta: number,
  ) {
    const [current] = await this.database
      .select()
      .from(userInterestProfiles)
      .where(eq(userInterestProfiles.userId, userId))
      .limit(1);
    const typeWeights = { ...(current?.typeWeights ?? {}) };
    const tagWeights = { ...(current?.tagWeights ?? {}) };
    typeWeights[workType] = clampWeight((typeWeights[workType] ?? 0) + delta);
    for (const tag of tags) tagWeights[tag] = clampWeight((tagWeights[tag] ?? 0) + delta * 0.5);
    await this.database
      .insert(userInterestProfiles)
      .values({
        userId,
        typeWeights,
        tagWeights,
        topicWeights: current?.topicWeights ?? {},
        coldStartComplete: current?.coldStartComplete ?? false,
        algorithmVersion: current?.algorithmVersion ?? "mvp-v1",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userInterestProfiles.userId,
        set: { typeWeights, tagWeights, updatedAt: new Date() },
      });
  }
}

function canAccess(
  unit: AccessLevel,
  section: AccessLevel,
  work: AccessLevel,
  membershipEnabled: boolean,
  memberActive: boolean,
) {
  return !membershipEnabled || memberActive || (unit ?? section ?? work ?? "public") === "public";
}

function isImageUnit(type: UnitType) {
  return type === "comic_chapter" || type === "image_set" || type === "photoshoot_set";
}

function groupImages(assets: Array<typeof mediaAssets.$inferSelect>) {
  const groups = new Map<string, Array<typeof mediaAssets.$inferSelect>>();
  for (const asset of assets) {
    if (!asset.logicalAssetId || (asset.variant !== "browse" && asset.variant !== "thumbnail")) {
      continue;
    }
    const group = groups.get(asset.logicalAssetId) ?? [];
    group.push(asset);
    groups.set(asset.logicalAssetId, group);
  }
  return [...groups.entries()]
    .flatMap(([logicalAssetId, group]) => {
      const browse = group.find((asset) => asset.variant === "browse");
      if (!browse) return [];
      return [
        {
          logicalAssetId,
          ordinal: browse.ordinal,
          browse,
          thumbnail: group.find((asset) => asset.variant === "thumbnail") ?? null,
        },
      ];
    })
    .sort((left, right) => left.ordinal - right.ordinal);
}

function progressDto(progress: typeof readingProgress.$inferSelect) {
  return {
    unitId: progress.unitId,
    progressType: progress.progressType as "gallery" | "comic",
    currentPage: progress.currentPage ?? 0,
    totalPages: progress.totalPages ?? 1,
    scrollAnchor: progress.scrollAnchor,
    readingMode: (progress.readingMode ?? "continuous") as "continuous" | "paged",
    pageLayout: (progress.pageLayout ?? "single") as "single" | "double",
    readingDirection: (progress.readingDirection ?? "ltr") as "ltr" | "rtl",
    updatedAt: progress.updatedAt.toISOString(),
  };
}

function scoreWork(
  work: { type: WorkType; metadata: { tags: string[]; year: number | "未知" } },
  typeWeights: Record<string, number>,
  tagWeights: Record<string, number>,
  heat: number,
  placement: "recommendations" | "rankings",
) {
  const affinity =
    (typeWeights[work.type] ?? 0) +
    work.metadata.tags.reduce((sum, tag) => sum + (tagWeights[tag] ?? 0), 0);
  const popularity = Math.log1p(heat);
  const freshness =
    typeof work.metadata.year === "number"
      ? Math.max(0, 4 - Math.max(0, new Date().getFullYear() - work.metadata.year))
      : 0;
  return placement === "rankings"
    ? popularity * 2.5 + affinity * 0.8 + freshness
    : affinity * 2.5 + popularity + freshness * 1.2;
}

function clampWeight(value: number) {
  return Math.max(-10, Math.min(50, Math.round(value * 1000) / 1000));
}
