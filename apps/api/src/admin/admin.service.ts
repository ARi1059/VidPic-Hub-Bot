import { Inject, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import {
  isUnitTypeAllowed,
  validateWorkPublication,
  type CreateArchiveSortRuleRequest,
  type PublicationAssetSnapshot,
  type PublicationSectionSnapshot,
} from "@film-bot/contracts";
import type { Database } from "@film-bot/database";
import {
  adminAuditLogs,
  archiveSortRules,
  contentSections,
  contentUnits,
  ingestionItems,
  mediaAssets,
  membershipConversionEvents,
  systemSettings,
  users,
  works,
} from "@film-bot/database";
import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";

import { DATABASE_CONNECTION } from "../tokens.js";

type WorkInsert = typeof works.$inferInsert;
type SectionInsert = typeof contentSections.$inferInsert;
type UnitInsert = typeof contentUnits.$inferInsert;
type MediaInsert = typeof mediaAssets.$inferInsert;
type LoosePartial<T> = { [Key in keyof T]?: T[Key] | undefined };
type ArchiveMediaInput = Pick<
  MediaInsert,
  "type" | "role" | "presentationScope" | "logicalAssetId" | "archiveSortRuleId" | "variant"
>;

interface AuditContext {
  adminId: string;
  requestId: string;
  ipAddress: string | null;
}

interface IngestionMetadata {
  type?: unknown;
  fileId?: unknown;
  fileUniqueId?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  fileSize?: unknown;
  width?: unknown;
  height?: unknown;
  durationSeconds?: unknown;
  archiveFormat?: unknown;
}

@Injectable()
export class AdminService {
  public constructor(@Inject(DATABASE_CONNECTION) private readonly database: Database) {}

  public listWorks(status?: "draft" | "published" | "withdrawn") {
    return this.database
      .select()
      .from(works)
      .where(status ? eq(works.publicationStatus, status) : undefined)
      .orderBy(desc(works.updatedAt), asc(works.title))
      .limit(200);
  }

  public async getWorkBundle(workId: string) {
    const [work] = await this.database.select().from(works).where(eq(works.id, workId));
    if (!work) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });
    const sections = await this.database
      .select()
      .from(contentSections)
      .where(eq(contentSections.workId, workId))
      .orderBy(asc(contentSections.sortOrder));
    const sectionIds = sections.map((section) => section.id);
    const units =
      sectionIds.length > 0
        ? await this.database
            .select()
            .from(contentUnits)
            .where(inArray(contentUnits.sectionId, sectionIds))
            .orderBy(asc(contentUnits.ordinal))
        : [];
    const unitIds = units.map((unit) => unit.id);
    const assets = await this.database
      .select()
      .from(mediaAssets)
      .where(
        unitIds.length > 0
          ? or(eq(mediaAssets.workId, workId), inArray(mediaAssets.unitId, unitIds))
          : eq(mediaAssets.workId, workId),
      )
      .orderBy(asc(mediaAssets.ordinal));
    return jsonSafe({ work, sections, units, assets });
  }

  public async createWork(data: WorkInsert, audit: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction.insert(works).values(data).returning();
      if (!created) throw new Error("Work insert returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "work.create", "work", created.id, null, created));
      return jsonSafe(created);
    });
  }

  public async updateWork(workId: string, data: LoosePartial<WorkInsert>, audit: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(works).where(eq(works.id, workId)).limit(1);
      if (!before) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });
      const [updated] = await transaction
        .update(works)
        .set({ ...cleanUpdate<WorkInsert>(data), updatedAt: new Date() })
        .where(eq(works.id, workId))
        .returning();
      if (!updated) throw new Error("Work update returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "work.update", "work", workId, before, updated));
      return jsonSafe(updated);
    });
  }

  public async createSection(
    workId: string,
    data: Omit<SectionInsert, "workId">,
    audit: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [work] = await transaction
        .select({ id: works.id })
        .from(works)
        .where(eq(works.id, workId));
      if (!work) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });
      const [created] = await transaction
        .insert(contentSections)
        .values({ ...data, workId })
        .returning();
      if (!created) throw new Error("Section insert returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "section.create", "section", created.id, null, created));
      return jsonSafe(created);
    });
  }

  public async updateSection(
    sectionId: string,
    data: LoosePartial<SectionInsert>,
    audit: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction
        .select()
        .from(contentSections)
        .where(eq(contentSections.id, sectionId));
      if (!before) throw new NotFoundException({ code: "NOT_FOUND", message: "分区不存在" });
      const [updated] = await transaction
        .update(contentSections)
        .set({ ...cleanUpdate<SectionInsert>(data), updatedAt: new Date() })
        .where(eq(contentSections.id, sectionId))
        .returning();
      if (!updated) throw new Error("Section update returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "section.update", "section", sectionId, before, updated));
      return jsonSafe(updated);
    });
  }

  public async createUnit(
    sectionId: string,
    data: Omit<UnitInsert, "sectionId">,
    audit: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [parent] = await transaction
        .select({ workType: works.type })
        .from(contentSections)
        .innerJoin(works, eq(works.id, contentSections.workId))
        .where(eq(contentSections.id, sectionId));
      if (!parent) throw new NotFoundException({ code: "NOT_FOUND", message: "分区不存在" });
      if (!isUnitTypeAllowed(parent.workType, data.type)) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: `作品类型 ${parent.workType} 不允许内容单元 ${data.type}`,
        });
      }
      const [created] = await transaction
        .insert(contentUnits)
        .values({ ...data, sectionId })
        .returning();
      if (!created) throw new Error("Unit insert returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "unit.create", "unit", created.id, null, created));
      return created;
    });
  }

  public async updateUnit(unitId: string, data: LoosePartial<UnitInsert>, audit: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction
        .select({ unit: contentUnits, workType: works.type })
        .from(contentUnits)
        .innerJoin(contentSections, eq(contentSections.id, contentUnits.sectionId))
        .innerJoin(works, eq(works.id, contentSections.workId))
        .where(eq(contentUnits.id, unitId));
      if (!before) throw new NotFoundException({ code: "NOT_FOUND", message: "内容单元不存在" });
      if (data.type && !isUnitTypeAllowed(before.workType, data.type)) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "内容类型与作品不匹配",
        });
      }
      const [updated] = await transaction
        .update(contentUnits)
        .set({ ...cleanUpdate<UnitInsert>(data), updatedAt: new Date() })
        .where(eq(contentUnits.id, unitId))
        .returning();
      if (!updated) throw new Error("Unit update returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "unit.update", "unit", unitId, before.unit, updated));
      return updated;
    });
  }

  public async createMedia(data: MediaInsert, audit: AuditContext) {
    ensureMediaOwner(data.workId ?? null, data.unitId ?? null);
    return this.database.transaction(async (transaction) => {
      validateArchiveMediaInput(data);
      if (data.type === "archive") {
        await ensureArchiveSortRuleEnabled(transaction, data.archiveSortRuleId);
      }
      const [created] = await transaction.insert(mediaAssets).values(data).returning();
      if (!created) throw new Error("Media insert returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "media.create", "media_asset", created.id, null, created));
      return jsonSafe(created);
    });
  }

  public async updateMedia(mediaId: string, data: LoosePartial<MediaInsert>, audit: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaId));
      if (!before) throw new NotFoundException({ code: "NOT_FOUND", message: "媒体资源不存在" });
      ensureMediaOwner(data.workId ?? before.workId, data.unitId ?? before.unitId);
      const nextArchiveInput = {
        type: data.type ?? before.type,
        role: data.role ?? before.role,
        presentationScope: data.presentationScope ?? before.presentationScope,
        logicalAssetId:
          data.logicalAssetId === undefined ? before.logicalAssetId : data.logicalAssetId,
        archiveSortRuleId:
          data.archiveSortRuleId === undefined ? before.archiveSortRuleId : data.archiveSortRuleId,
        variant: data.variant === undefined ? before.variant : data.variant,
      };
      validateArchiveMediaInput(nextArchiveInput);
      if (nextArchiveInput.type === "archive") {
        await ensureArchiveSortRuleEnabled(transaction, nextArchiveInput.archiveSortRuleId);
      }
      const width = data.width === undefined ? before.width : data.width;
      const height = data.height === undefined ? before.height : data.height;
      const [updated] = await transaction
        .update(mediaAssets)
        .set({
          ...cleanUpdate<MediaInsert>(data),
          pixelCount: width && height ? width * height : null,
          updatedAt: new Date(),
        })
        .where(eq(mediaAssets.id, mediaId))
        .returning();
      if (!updated) throw new Error("Media update returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "media.update", "media_asset", mediaId, before, updated));
      return jsonSafe(updated);
    });
  }

  public async promoteMediaCover(
    mediaId: string,
    input: { workId?: string | undefined },
    audit: AuditContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [source] = await transaction
        .select({ asset: mediaAssets, unitWorkId: contentSections.workId })
        .from(mediaAssets)
        .leftJoin(contentUnits, eq(contentUnits.id, mediaAssets.unitId))
        .leftJoin(contentSections, eq(contentSections.id, contentUnits.sectionId))
        .where(eq(mediaAssets.id, mediaId))
        .limit(1);
      if (!source) throw new NotFoundException({ code: "NOT_FOUND", message: "媒体资源不存在" });

      const workId = input.workId ?? source.asset.workId ?? source.unitWorkId;
      if (!workId) {
        throw new BadRequestException({ code: "VALIDATION_FAILED", message: "媒体未关联作品" });
      }
      if (
        input.workId &&
        ((source.asset.workId && source.asset.workId !== input.workId) ||
          (source.unitWorkId && source.unitWorkId !== input.workId))
      ) {
        throw new BadRequestException({ code: "VALIDATION_FAILED", message: "媒体与作品不匹配" });
      }
      if (
        source.asset.type !== "image" ||
        !["browse", "thumbnail"].includes(source.asset.variant ?? "") ||
        source.asset.presentationScope !== "public_preview" ||
        source.asset.status !== "available"
      ) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "只有可用的公开预览 browse 或 thumbnail 图片可以设为封面",
        });
      }

      const [work] = await transaction
        .select({ id: works.id })
        .from(works)
        .where(eq(works.id, workId))
        .limit(1);
      if (!work) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });

      const [cover] = await transaction
        .insert(mediaAssets)
        .values({
          workId,
          unitId: null,
          type: "image",
          role: "public_cover",
          storageChatId: source.asset.storageChatId,
          sourceMessageId: source.asset.sourceMessageId,
          fileId: source.asset.fileId,
          fileUniqueId: source.asset.fileUniqueId,
          fileName: source.asset.fileName,
          mimeType: source.asset.mimeType,
          fileSize: source.asset.fileSize,
          width: source.asset.width,
          height: source.asset.height,
          durationSeconds: null,
          videoVersion: null,
          pixelCount: source.asset.pixelCount,
          isPrimary: true,
          logicalAssetId: source.asset.logicalAssetId,
          parentAssetId: source.asset.id,
          variant: source.asset.variant,
          presentationScope: "public_preview",
          ordinal: 0,
          status: "available",
        })
        .returning();
      if (!cover) throw new Error("Public cover insert returned no row");

      const [updated] = await transaction
        .update(works)
        .set({ publicCoverAssetId: cover.id, updatedAt: new Date() })
        .where(eq(works.id, workId))
        .returning();
      if (!updated) throw new Error("Public cover work update returned no row");

      await transaction
        .insert(adminAuditLogs)
        .values(
          auditValues(audit, "media.promote_cover", "media_asset", cover.id, source.asset, cover),
        );
      return jsonSafe(cover);
    });
  }

  public async publishWork(workId: string, audit: AuditContext) {
    const snapshot = await this.publicationSnapshot(workId);
    const issues = validateWorkPublication(snapshot);
    if (issues.length > 0) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "作品未达到发布条件",
        details: { issues },
      });
    }
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(works).where(eq(works.id, workId));
      if (!before) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });
      const [updated] = await transaction
        .update(works)
        .set({ publicationStatus: "published", publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(works.id, workId))
        .returning();
      if (!updated) throw new Error("Publish returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "work.publish", "work", workId, before, updated));
      return updated;
    });
  }

  public async withdrawWork(workId: string, audit: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(works).where(eq(works.id, workId));
      if (!before) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });
      const [updated] = await transaction
        .update(works)
        .set({ publicationStatus: "withdrawn", updatedAt: new Date() })
        .where(eq(works.id, workId))
        .returning();
      if (!updated) throw new Error("Withdraw returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "work.withdraw", "work", workId, before, updated));
      return updated;
    });
  }

  public async getSettings() {
    const [settings] = await this.database.select().from(systemSettings).limit(1);
    return settings ?? { membershipEnabled: true, recommendationVersion: "mvp-v1" };
  }

  public async setMembershipEnabled(membershipEnabled: boolean, audit: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(systemSettings).limit(1);
      const [updated] = before
        ? await transaction
            .update(systemSettings)
            .set({ membershipEnabled, updatedByAdminId: audit.adminId, updatedAt: new Date() })
            .where(eq(systemSettings.id, before.id))
            .returning()
        : await transaction
            .insert(systemSettings)
            .values({ membershipEnabled, updatedByAdminId: audit.adminId })
            .returning();
      if (!updated) throw new Error("Settings update returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(
          auditValues(audit, "settings.membership", "system_settings", updated.id, before, updated),
        );
      return updated;
    });
  }

  public async updateMembership(
    userId: string,
    input: { active: boolean; expiresAt: string | null; idempotencyKey: string },
    audit: AuditContext,
  ) {
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (input.active && expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "会员有效期必须晚于当前时间",
      });
    }
    return this.database.transaction(async (transaction) => {
      const [before] = await transaction.select().from(users).where(eq(users.id, userId));
      if (!before) throw new NotFoundException({ code: "NOT_FOUND", message: "用户不存在" });
      const beforeValid =
        before.memberActive &&
        (!before.memberExpiresAt || before.memberExpiresAt.getTime() > Date.now());
      const nextValid = input.active && (!expiresAt || expiresAt.getTime() > Date.now());
      const [updated] = await transaction
        .update(users)
        .set({ memberActive: input.active, memberExpiresAt: expiresAt, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      if (!updated) throw new Error("Membership update returned no row");

      if (!beforeValid && nextValid) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [attributedOpen] = await transaction
          .select({ id: membershipConversionEvents.id })
          .from(membershipConversionEvents)
          .where(
            and(
              eq(membershipConversionEvents.userId, userId),
              eq(membershipConversionEvents.eventType, "membership_cta_open"),
              gte(membershipConversionEvents.occurredAt, thirtyDaysAgo),
            ),
          )
          .orderBy(desc(membershipConversionEvents.occurredAt))
          .limit(1);
        await transaction
          .insert(membershipConversionEvents)
          .values({
            userId,
            eventType: "membership_activated",
            idempotencyKey: input.idempotencyKey,
            actorAdminId: audit.adminId,
            attributedOpenEventId: attributedOpen?.id,
          })
          .onConflictDoNothing();
      }

      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "user.membership", "user", userId, before, updated));
      return updated;
    });
  }

  public async listUsers() {
    const rows = await this.database
      .select({
        id: users.id,
        telegramUserId: users.telegramUserId,
        username: users.username,
        displayName: users.displayName,
        status: users.status,
        memberActive: users.memberActive,
        memberExpiresAt: users.memberExpiresAt,
        botSendStatus: users.botSendStatus,
        lastActiveAt: users.lastActiveAt,
      })
      .from(users)
      .orderBy(desc(users.lastActiveAt))
      .limit(200);
    return jsonSafe(rows);
  }

  public async listIngestionItems() {
    const rows = await this.database
      .select()
      .from(ingestionItems)
      .orderBy(desc(ingestionItems.createdAt))
      .limit(200);
    return jsonSafe(rows);
  }

  public async listArchiveSortRules() {
    const rules = await this.database
      .select()
      .from(archiveSortRules)
      .orderBy(
        desc(archiveSortRules.system),
        asc(archiveSortRules.priority),
        asc(archiveSortRules.name),
      );
    return jsonSafe(rules);
  }

  public async createArchiveSortRule(input: CreateArchiveSortRuleRequest, audit: AuditContext) {
    validateArchiveRulePatterns(input);
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(archiveSortRules)
        .values({
          name: input.name,
          description: input.description ?? null,
          kind: input.kind,
          filePattern: input.filePattern ?? null,
          chapterPattern: input.chapterPattern ?? null,
          pagePattern: input.pagePattern ?? null,
          direction: input.direction,
          priority: input.priority,
          enabled: input.enabled,
          system: false,
          createdByAdminId: audit.adminId,
        })
        .returning();
      if (!created) throw new Error("Archive sort rule insert returned no row");
      await transaction
        .insert(adminAuditLogs)
        .values(
          auditValues(
            audit,
            "archive_sort_rule.create",
            "archive_sort_rule",
            created.id,
            null,
            created,
          ),
        );
      return jsonSafe(created);
    });
  }

  public async deleteArchiveSortRule(ruleId: string, audit: AuditContext) {
    return this.database.transaction(async (transaction) => {
      const [rule] = await transaction
        .select()
        .from(archiveSortRules)
        .where(eq(archiveSortRules.id, ruleId));
      if (!rule) throw new NotFoundException({ code: "NOT_FOUND", message: "排序规则不存在" });
      if (rule.system) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "内置排序规则不能删除",
        });
      }
      const [inUse] = await transaction
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(eq(mediaAssets.archiveSortRuleId, ruleId))
        .limit(1);
      if (inUse) {
        throw new BadRequestException({
          code: "CONFLICT",
          message: "排序规则已被压缩包导入源使用，不能删除",
        });
      }
      await transaction.delete(archiveSortRules).where(eq(archiveSortRules.id, ruleId));
      await transaction
        .insert(adminAuditLogs)
        .values(
          auditValues(audit, "archive_sort_rule.delete", "archive_sort_rule", ruleId, rule, null),
        );
      return { id: ruleId };
    });
  }

  public async attachIngestion(
    ingestionId: string,
    input: {
      workId?: string | null | undefined;
      unitId?: string | null | undefined;
      role: string;
      variant?: "source" | "browse" | "thumbnail" | null | undefined;
      presentationScope: "public_preview" | "protected_content";
      logicalAssetId?: string | null | undefined;
      archiveSortRuleId?: string | null | undefined;
      ordinal: number;
    },
    audit: AuditContext,
  ) {
    ensureMediaOwner(input.workId ?? null, input.unitId ?? null);
    return this.database.transaction(async (transaction) => {
      const [item] = await transaction
        .select()
        .from(ingestionItems)
        .where(eq(ingestionItems.id, ingestionId));
      if (!item) throw new NotFoundException({ code: "NOT_FOUND", message: "入库记录不存在" });
      if (item.status === "linked") {
        throw new BadRequestException({ code: "CONFLICT", message: "入库记录已经关联" });
      }
      const metadata = item.mediaMetadata as IngestionMetadata;
      const fileId = stringValue(metadata.fileId);
      const type = mediaTypeValue(metadata.type);
      if (!fileId || !type) {
        throw new BadRequestException({
          code: "VALIDATION_FAILED",
          message: "入库媒体元数据不完整",
        });
      }
      const width = numberValue(metadata.width);
      const height = numberValue(metadata.height);
      validateArchiveMediaInput({
        type,
        role: input.role,
        presentationScope: input.presentationScope,
        logicalAssetId: input.logicalAssetId,
        archiveSortRuleId: input.archiveSortRuleId,
        variant: input.variant,
      });
      if (type === "archive") {
        await ensureArchiveSortRuleEnabled(transaction, input.archiveSortRuleId);
      }
      const [asset] = await transaction
        .insert(mediaAssets)
        .values({
          workId: input.workId,
          unitId: input.unitId,
          type,
          role: input.role,
          storageChatId: item.storageChatId,
          sourceMessageId: item.sourceMessageId,
          fileId,
          fileUniqueId: stringValue(metadata.fileUniqueId),
          fileName: stringValue(metadata.fileName),
          mimeType: stringValue(metadata.mimeType),
          fileSize: numberValue(metadata.fileSize),
          width,
          height,
          durationSeconds: numberValue(metadata.durationSeconds),
          pixelCount: width && height ? width * height : null,
          logicalAssetId: input.logicalAssetId,
          archiveSortRuleId: input.archiveSortRuleId ?? null,
          variant: input.variant,
          presentationScope: input.presentationScope,
          ordinal: input.ordinal,
          status: "pending",
        })
        .returning();
      if (!asset) throw new Error("Ingestion attachment returned no media row");
      await transaction
        .update(ingestionItems)
        .set({ status: "linked", operatorAdminId: audit.adminId, updatedAt: new Date() })
        .where(eq(ingestionItems.id, ingestionId));
      await transaction
        .insert(adminAuditLogs)
        .values(auditValues(audit, "ingestion.attach", "ingestion_item", ingestionId, item, asset));
      return jsonSafe(asset);
    });
  }

  public listAuditLogs() {
    return this.database
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(200);
  }

  private async publicationSnapshot(workId: string) {
    const [work] = await this.database.select().from(works).where(eq(works.id, workId));
    if (!work) throw new NotFoundException({ code: "NOT_FOUND", message: "作品不存在" });
    const sections = await this.database
      .select()
      .from(contentSections)
      .where(eq(contentSections.workId, workId));
    const sectionIds = sections.map((section) => section.id);
    const units =
      sectionIds.length > 0
        ? await this.database
            .select()
            .from(contentUnits)
            .where(inArray(contentUnits.sectionId, sectionIds))
        : [];
    const unitIds = units.map((unit) => unit.id);
    const assets =
      unitIds.length > 0
        ? await this.database.select().from(mediaAssets).where(inArray(mediaAssets.unitId, unitIds))
        : [];
    const [cover] = work.publicCoverAssetId
      ? await this.database
          .select()
          .from(mediaAssets)
          .where(eq(mediaAssets.id, work.publicCoverAssetId))
      : [];
    const assetsByUnit = groupBy(assets, (asset) => asset.unitId ?? "");
    const unitsBySection = groupBy(units, (unit) => unit.sectionId);

    const publicationSections: PublicationSectionSnapshot[] = sections.map((section) => ({
      id: section.id,
      publicationStatus: section.publicationStatus,
      units: (unitsBySection.get(section.id) ?? []).map((unit) => ({
        id: unit.id,
        type: unit.type,
        publicationStatus: unit.publicationStatus,
        assets: (assetsByUnit.get(unit.id) ?? []).map<PublicationAssetSnapshot>((asset) => ({
          id: asset.id,
          type: asset.type,
          variant: asset.variant,
          presentationScope: asset.presentationScope,
          status: asset.status,
          logicalAssetId: asset.logicalAssetId,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          width: asset.width,
          height: asset.height,
          ordinal: asset.ordinal,
        })),
      })),
    }));
    return {
      type: work.type,
      publicCoverAssetId: work.publicCoverAssetId,
      publicCover: cover
        ? {
            id: cover.id,
            mediaType: cover.type,
            variant: cover.variant,
            presentationScope: cover.presentationScope,
            status: cover.status,
          }
        : null,
      sections: publicationSections,
    };
  }
}

function ensureMediaOwner(workId: string | null | undefined, unitId: string | null | undefined) {
  if (!workId && !unitId) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "媒体资源必须关联作品或内容单元",
    });
  }
}

function auditValues(
  context: AuditContext,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
) {
  return {
    adminId: context.adminId,
    action,
    targetType,
    targetId,
    before: jsonObject(before),
    after: jsonObject(after),
    requestId: context.requestId,
    ipAddress: context.ipAddress,
  };
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as Record<string, unknown>;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = result.get(groupKey) ?? [];
    group.push(item);
    result.set(groupKey, group);
  }
  return result;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mediaTypeValue(
  value: unknown,
): "video" | "image" | "thumbnail" | "cover" | "file" | "archive" | null {
  return value === "video" ||
    value === "image" ||
    value === "thumbnail" ||
    value === "cover" ||
    value === "file" ||
    value === "archive"
    ? value
    : null;
}

export function validateArchiveMediaInput(input: ArchiveMediaInput) {
  if (input.type === "archive") {
    if (input.role !== "archive_source") {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "压缩包入库角色必须为 archive_source",
      });
    }
    if (input.variant || input.logicalAssetId) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "压缩包导入源不能设置图片版本或逻辑资源 ID",
      });
    }
    if (input.presentationScope !== "protected_content") {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "压缩包导入源必须保持受保护范围",
      });
    }
    return;
  }
  if (input.archiveSortRuleId) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "只有压缩包导入源可以关联图片排序规则",
    });
  }
}

async function ensureArchiveSortRuleEnabled(
  database: Pick<Database, "select">,
  archiveSortRuleId: string | null | undefined,
) {
  if (!archiveSortRuleId) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "压缩包入库必须选择图片排序规则",
    });
  }
  const [rule] = await database
    .select({ id: archiveSortRules.id, enabled: archiveSortRules.enabled })
    .from(archiveSortRules)
    .where(eq(archiveSortRules.id, archiveSortRuleId));
  if (!rule || !rule.enabled) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "图片排序规则不可用",
    });
  }
}

function validateArchiveRulePatterns(input: CreateArchiveSortRuleRequest) {
  for (const [label, pattern] of [
    ["图片过滤", input.filePattern],
    ["章节", input.chapterPattern],
    ["页码", input.pagePattern],
  ] as const) {
    if (!pattern) continue;
    if (/(?:\\\\[1-9]|\(\?<=[^)]*\)|\(\?<![^)]*\)|\([^)]*[+*][^)]*\)[+*{])/u.test(pattern)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: `${label}正则不支持回溯引用、后行断言或嵌套量词`,
      });
    }
    try {
      new RegExp(pattern, "u");
    } catch {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: `${label}正则无效` });
    }
  }
}

function cleanUpdate<T extends object>(value: object): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;
}
