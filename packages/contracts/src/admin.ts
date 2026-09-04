import { z } from "zod";

import { accessLevelSchema, publicationStatusSchema } from "./access.js";
import { sectionTypeSchema, unitTypeSchema, workTypeSchema } from "./catalog.js";
import {
  mediaStatusSchema,
  mediaTypeSchema,
  mediaVariantSchema,
  presentationScopeSchema,
} from "./media.js";

const optionalText = z.string().trim().min(1).nullable().optional();
const optionalTextArray = z.array(z.string().trim().min(1)).optional();

export const createWorkRequestSchema = z.object({
  type: workTypeSchema,
  subtype: optionalText,
  title: z.string().trim().min(1).max(200),
  originalTitle: optionalText,
  aliases: optionalTextArray,
  summary: optionalText,
  publicCoverAssetId: z.string().uuid().nullable().optional(),
  region: optionalText,
  releaseYear: z.number().int().min(1800).max(3000).nullable().optional(),
  releaseDate: z.iso.date().nullable().optional(),
  language: optionalText,
  tags: optionalTextArray,
  releaseStatus: optionalText,
  contentRating: optionalText,
  directors: optionalTextArray,
  actors: optionalTextArray,
  screenwriters: optionalTextArray,
  producers: optionalTextArray,
  productionCompanies: optionalTextArray,
  totalEpisodes: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  authors: optionalTextArray,
  originalAuthors: optionalTextArray,
  artists: optionalTextArray,
  publisher: optionalText,
  serializationPlatform: optionalText,
  serializationStatus: optionalText,
  photographers: optionalTextArray,
  subjects: optionalTextArray,
  studio: optionalText,
  shootDate: z.iso.date().nullable().optional(),
  location: optionalText,
  volumeCount: z.number().int().positive().nullable().optional(),
  accessLevel: accessLevelSchema.nullable().optional(),
  sortOrder: z.number().int().default(0),
});

export const updateWorkRequestSchema = createWorkRequestSchema.partial();

export const createSectionRequestSchema = z.object({
  type: sectionTypeSchema,
  title: z.string().trim().min(1).max(100),
  sortOrder: z.number().int().default(0),
  publicationStatus: publicationStatusSchema.default("draft"),
  accessLevel: accessLevelSchema.nullable().optional(),
});
export const updateSectionRequestSchema = createSectionRequestSchema.partial();

export const createUnitRequestSchema = z.object({
  type: unitTypeSchema,
  title: z.string().trim().min(1).max(200),
  ordinal: z.number().int().nonnegative().default(0),
  seasonNumber: z.number().int().positive().nullable().optional(),
  episodeNumber: z.number().int().positive().nullable().optional(),
  chapterNumber: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  summary: optionalText,
  coverAssetId: z.string().uuid().nullable().optional(),
  publicationStatus: publicationStatusSchema.default("draft"),
  accessLevel: accessLevelSchema.nullable().optional(),
});
export const updateUnitRequestSchema = createUnitRequestSchema.partial();

export const createMediaAssetRequestSchema = z.object({
  workId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  type: mediaTypeSchema,
  role: z.string().trim().min(1).max(100),
  storageChatId: z.string().regex(/^-?\d+$/),
  sourceMessageId: z.number().int().positive(),
  fileId: z.string().min(1),
  fileUniqueId: optionalText,
  fileName: optionalText,
  mimeType: optionalText,
  fileSize: z.number().int().positive().max(4_500_000_000).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  durationSeconds: z.number().int().positive().nullable().optional(),
  videoVersion: optionalText,
  isPrimary: z.boolean().default(false),
  logicalAssetId: z.string().uuid().nullable().optional(),
  parentAssetId: z.string().uuid().nullable().optional(),
  archiveSortRuleId: z.string().uuid().nullable().optional(),
  variant: mediaVariantSchema.nullable().optional(),
  presentationScope: presentationScopeSchema.default("protected_content"),
  ordinal: z.number().int().nonnegative().default(0),
  status: mediaStatusSchema.default("pending"),
});

export const updateMediaAssetRequestSchema = createMediaAssetRequestSchema.partial();

export const membershipSettingRequestSchema = z.object({ membershipEnabled: z.boolean() });
export const updateUserMembershipRequestSchema = z.object({
  active: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  idempotencyKey: z.string().min(8).max(128),
});

export const ingestionAttachRequestSchema = z.object({
  workId: z.string().uuid().nullable().optional(),
  unitId: z.string().uuid().nullable().optional(),
  role: z.string().trim().min(1),
  variant: mediaVariantSchema.nullable().optional(),
  presentationScope: presentationScopeSchema.default("protected_content"),
  logicalAssetId: z.string().uuid().nullable().optional(),
  archiveSortRuleId: z.string().uuid().nullable().optional(),
  ordinal: z.number().int().nonnegative().default(0),
});

export const archiveSortRuleIdSchema = z.object({ archiveSortRuleId: z.string().uuid() });

export const promoteMediaCoverRequestSchema = z.object({
  workId: z.string().uuid().optional(),
});
