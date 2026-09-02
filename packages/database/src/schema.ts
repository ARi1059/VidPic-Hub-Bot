import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const userStatusEnum = pgEnum("user_status", ["active", "suspended", "deleted"]);
export const botSendStatusEnum = pgEnum("bot_send_status", [
  "unknown",
  "available",
  "not_started",
  "blocked",
]);
export const environmentEnum = pgEnum("app_environment", [
  "development",
  "test",
  "staging",
  "production",
]);
export const accessLevelEnum = pgEnum("access_level", ["public", "member"]);
export const publicationStatusEnum = pgEnum("publication_status", [
  "draft",
  "published",
  "withdrawn",
]);
export const workTypeEnum = pgEnum("work_type", ["video", "comic", "gallery", "photoshoot"]);
export const sectionTypeEnum = pgEnum("section_type", [
  "play",
  "episodes",
  "stills",
  "comic_catalog",
  "gallery",
  "photoshoot",
  "behind_the_scenes",
]);
export const unitTypeEnum = pgEnum("unit_type", [
  "movie",
  "episode",
  "short_video",
  "comic_chapter",
  "image_set",
  "photoshoot_set",
  "behind_the_scenes_video",
]);
export const mediaTypeEnum = pgEnum("media_type", ["video", "image", "thumbnail", "cover", "file"]);
export const mediaVariantEnum = pgEnum("media_variant", ["source", "browse", "thumbnail"]);
export const presentationScopeEnum = pgEnum("presentation_scope", [
  "public_preview",
  "protected_content",
]);
export const mediaStatusEnum = pgEnum("media_status", [
  "pending",
  "available",
  "invalid",
  "withdrawn",
]);
export const deliveryStatusEnum = pgEnum("delivery_status", [
  "queued",
  "sending",
  "succeeded",
  "failed",
]);
export const conversionEventTypeEnum = pgEnum("conversion_event_type", [
  "membership_cta_open",
  "membership_activated",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).notNull(),
    username: text("username"),
    displayName: text("display_name").notNull(),
    languageCode: text("language_code"),
    photoUrl: text("photo_url"),
    status: userStatusEnum("status").notNull().default("active"),
    memberActive: boolean("member_active").notNull().default(false),
    memberExpiresAt: timestamp("member_expires_at", { withTimezone: true }),
    botStartedAt: timestamp("bot_started_at", { withTimezone: true }),
    botSendStatus: botSendStatusEnum("bot_send_status").notNull().default("unknown"),
    botSendStatusCheckedAt: timestamp("bot_send_status_checked_at", { withTimezone: true }),
    botSendFailureReason: text("bot_send_failure_reason"),
    firstLoginAt: timestamp("first_login_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_telegram_user_id_unique").on(table.telegramUserId)],
);

export const adminRoles = pgTable("admin_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const adminAccounts = pgTable(
  "admin_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => adminRoles.id),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("admin_accounts_telegram_user_id_unique").on(table.telegramUserId)],
);

export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  membershipEnabled: boolean("membership_enabled").notNull().default(true),
  recommendationVersion: text("recommendation_version").notNull().default("mvp-v1"),
  membershipCtaText: text("membership_cta_text").notNull().default("开通会员"),
  membershipCtaUrl: text("membership_cta_url"),
  membershipCtaVersion: integer("membership_cta_version").notNull().default(1),
  environment: environmentEnum("environment").notNull().default("development"),
  updatedByAdminId: uuid("updated_by_admin_id").references(() => adminAccounts.id),
  ...timestamps,
});

export const works = pgTable(
  "works",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: workTypeEnum("type").notNull(),
    subtype: text("subtype"),
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
    summary: text("summary"),
    publicCoverAssetId: uuid("public_cover_asset_id").references(
      (): AnyPgColumn => mediaAssets.id,
      { onDelete: "set null" },
    ),
    region: text("region"),
    releaseYear: integer("release_year"),
    releaseDate: date("release_date"),
    language: text("language"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    releaseStatus: text("release_status"),
    contentRating: text("content_rating"),
    directors: jsonb("directors").$type<string[]>().notNull().default([]),
    actors: jsonb("actors").$type<string[]>().notNull().default([]),
    screenwriters: jsonb("screenwriters").$type<string[]>().notNull().default([]),
    producers: jsonb("producers").$type<string[]>().notNull().default([]),
    productionCompanies: jsonb("production_companies").$type<string[]>().notNull().default([]),
    totalEpisodes: integer("total_episodes"),
    durationSeconds: integer("duration_seconds"),
    authors: jsonb("authors").$type<string[]>().notNull().default([]),
    originalAuthors: jsonb("original_authors").$type<string[]>().notNull().default([]),
    artists: jsonb("artists").$type<string[]>().notNull().default([]),
    publisher: text("publisher"),
    serializationPlatform: text("serialization_platform"),
    serializationStatus: text("serialization_status"),
    photographers: jsonb("photographers").$type<string[]>().notNull().default([]),
    subjects: jsonb("subjects").$type<string[]>().notNull().default([]),
    studio: text("studio"),
    shootDate: date("shoot_date"),
    location: text("location"),
    volumeCount: integer("volume_count"),
    publicationStatus: publicationStatusEnum("publication_status").notNull().default("draft"),
    accessLevel: accessLevelEnum("access_level"),
    sortOrder: integer("sort_order").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("works_publication_sort_index").on(table.publicationStatus, table.sortOrder),
    index("works_type_index").on(table.type),
    check(
      "works_release_year_check",
      sql`${table.releaseYear} is null or (${table.releaseYear} >= 1800 and ${table.releaseYear} <= 3000)`,
    ),
  ],
);

export const contentSections = pgTable(
  "content_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    type: sectionTypeEnum("type").notNull(),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    publicationStatus: publicationStatusEnum("publication_status").notNull().default("draft"),
    accessLevel: accessLevelEnum("access_level"),
    ...timestamps,
  },
  (table) => [index("content_sections_work_index").on(table.workId, table.sortOrder)],
);

export const contentUnits = pgTable(
  "content_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => contentSections.id, { onDelete: "cascade" }),
    type: unitTypeEnum("type").notNull(),
    title: text("title").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    chapterNumber: numeric("chapter_number", { precision: 10, scale: 2 }),
    summary: text("summary"),
    coverAssetId: uuid("cover_asset_id").references((): AnyPgColumn => mediaAssets.id, {
      onDelete: "set null",
    }),
    publicationStatus: publicationStatusEnum("publication_status").notNull().default("draft"),
    accessLevel: accessLevelEnum("access_level"),
    ...timestamps,
  },
  (table) => [
    index("content_units_section_index").on(table.sectionId, table.ordinal),
    uniqueIndex("content_units_section_ordinal_unique").on(table.sectionId, table.ordinal),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("work_id").references(() => works.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => contentUnits.id, { onDelete: "cascade" }),
    type: mediaTypeEnum("type").notNull(),
    role: text("role").notNull(),
    storageChatId: bigint("storage_chat_id", { mode: "bigint" }).notNull(),
    sourceMessageId: integer("source_message_id").notNull(),
    fileId: text("file_id").notNull(),
    fileUniqueId: text("file_unique_id"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    fileSize: bigint("file_size", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    videoVersion: text("video_version"),
    pixelCount: bigint("pixel_count", { mode: "number" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    logicalAssetId: uuid("logical_asset_id"),
    parentAssetId: uuid("parent_asset_id").references((): AnyPgColumn => mediaAssets.id, {
      onDelete: "set null",
    }),
    variant: mediaVariantEnum("variant"),
    presentationScope: presentationScopeEnum("presentation_scope")
      .notNull()
      .default("protected_content"),
    ordinal: integer("ordinal").notNull().default(0),
    status: mediaStatusEnum("status").notNull().default("pending"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("media_assets_source_unique").on(table.storageChatId, table.sourceMessageId),
    index("media_assets_unit_index").on(table.unitId, table.ordinal),
    index("media_assets_logical_variant_index").on(table.logicalAssetId, table.variant),
    check(
      "media_assets_owner_check",
      sql`${table.workId} is not null or ${table.unitId} is not null`,
    ),
  ],
);

export const contentRelations = pgTable(
  "content_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceWorkId: uuid("source_work_id").references(() => works.id, { onDelete: "cascade" }),
    sourceUnitId: uuid("source_unit_id").references(() => contentUnits.id, { onDelete: "cascade" }),
    targetWorkId: uuid("target_work_id").references(() => works.id, { onDelete: "cascade" }),
    targetUnitId: uuid("target_unit_id").references(() => contentUnits.id, { onDelete: "cascade" }),
    relationType: text("relation_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    check(
      "content_relations_source_check",
      sql`${table.sourceWorkId} is not null or ${table.sourceUnitId} is not null`,
    ),
    check(
      "content_relations_target_check",
      sql`${table.targetWorkId} is not null or ${table.targetUnitId} is not null`,
    ),
  ],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.workId] })],
);

export const readingProgress = pgTable(
  "reading_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => contentUnits.id, { onDelete: "cascade" }),
    progressType: text("progress_type").notNull(),
    currentPage: integer("current_page"),
    totalPages: integer("total_pages"),
    scrollAnchor: text("scroll_anchor"),
    readingMode: text("reading_mode"),
    pageLayout: text("page_layout"),
    readingDirection: text("reading_direction"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.unitId] })],
);

export const contentEvents = pgTable(
  "content_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id").references(() => contentUnits.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    weight: numeric("weight", { precision: 8, scale: 3 }).notNull().default("1"),
    recommendationRequestId: uuid("recommendation_request_id"),
    source: text("source").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    algorithmVersion: text("algorithm_version"),
    placement: text("placement"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("content_events_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("content_events_user_time_index").on(table.userId, table.occurredAt),
  ],
);

export const recommendationRequests = pgTable(
  "recommendation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placement: text("placement").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    workIds: jsonb("work_ids").$type<string[]>().notNull().default([]),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("recommendation_requests_user_expiry_index").on(table.userId, table.expiresAt)],
);

export const membershipCtaTokens = pgTable(
  "membership_cta_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workId: uuid("work_id").references(() => works.id, { onDelete: "set null" }),
    sourcePlacement: text("source_placement").notNull(),
    recommendationRequestId: uuid("recommendation_request_id"),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("membership_cta_tokens_user_expiry_index").on(table.userId, table.expiresAt)],
);

export const membershipConversionEvents = pgTable(
  "membership_conversion_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workId: uuid("work_id").references(() => works.id, { onDelete: "set null" }),
    eventType: conversionEventTypeEnum("event_type").notNull(),
    sourcePlacement: text("source_placement"),
    recommendationRequestId: uuid("recommendation_request_id"),
    tokenHash: text("token_hash"),
    idempotencyKey: text("idempotency_key").notNull(),
    actorAdminId: uuid("actor_admin_id").references(() => adminAccounts.id),
    attributedOpenEventId: uuid("attributed_open_event_id").references(
      (): AnyPgColumn => membershipConversionEvents.id,
      { onDelete: "set null" },
    ),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("membership_conversion_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("membership_conversion_user_time_index").on(table.userId, table.occurredAt),
  ],
);

export const userInterestProfiles = pgTable("user_interest_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  typeWeights: jsonb("type_weights").$type<Record<string, number>>().notNull().default({}),
  tagWeights: jsonb("tag_weights").$type<Record<string, number>>().notNull().default({}),
  topicWeights: jsonb("topic_weights").$type<Record<string, number>>().notNull().default({}),
  coldStartComplete: boolean("cold_start_complete").notNull().default(false),
  algorithmVersion: text("algorithm_version").notNull().default("mvp-v1"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    accessLevel: accessLevelEnum("access_level").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    source: text("source").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (table) => [index("entitlements_user_validity_index").on(table.userId, table.expiresAt)],
);

export const mediaDeliveries = pgTable(
  "media_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    workId: uuid("work_id")
      .notNull()
      .references(() => works.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => contentUnits.id),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    sourceChatId: bigint("source_chat_id", { mode: "bigint" }).notNull(),
    sourceMessageId: integer("source_message_id").notNull(),
    targetChatId: bigint("target_chat_id", { mode: "bigint" }).notNull(),
    targetMessageId: integer("target_message_id"),
    status: deliveryStatusEnum("status").notNull().default("queued"),
    protectedContent: boolean("protected_content").notNull().default(true),
    idempotencyKey: text("idempotency_key").notNull(),
    telegramErrorCode: integer("telegram_error_code"),
    telegramErrorDescription: text("telegram_error_description"),
    retryCount: integer("retry_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("media_deliveries_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("media_deliveries_status_index").on(table.status, table.createdAt),
  ],
);

export const ingestionItems = pgTable(
  "ingestion_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageChatId: bigint("storage_chat_id", { mode: "bigint" }).notNull(),
    sourceMessageId: integer("source_message_id").notNull(),
    mediaMetadata: jsonb("media_metadata").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("pending"),
    operatorAdminId: uuid("operator_admin_id").references(() => adminAccounts.id),
    failureReason: text("failure_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("ingestion_items_source_unique").on(table.storageChatId, table.sourceMessageId),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => adminAccounts.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    requestId: text("request_id").notNull(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("admin_audit_logs_admin_time_index").on(table.adminId, table.createdAt)],
);
