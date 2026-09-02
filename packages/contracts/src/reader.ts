import { z } from "zod";

import {
  publicCoverSchema,
  unitTypeSchema,
  workListItemSchema,
  workTypeSchema,
} from "./catalog.js";

export const readingModeSchema = z.enum(["continuous", "paged"]);
export const pageLayoutSchema = z.enum(["single", "double"]);
export const readingDirectionSchema = z.enum(["ltr", "rtl"]);
export const progressTypeSchema = z.enum(["gallery", "comic"]);

export const imageVariantSummarySchema = z.object({
  assetId: z.string().uuid(),
  url: z.string().url(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  mimeType: z.string().nullable(),
});

export const unitImageSchema = z.object({
  logicalAssetId: z.string().uuid(),
  ordinal: z.number().int().nonnegative(),
  browse: imageVariantSummarySchema,
  thumbnail: imageVariantSummarySchema.nullable(),
});

export const readingProgressSchema = z.object({
  unitId: z.string().uuid(),
  progressType: progressTypeSchema,
  currentPage: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  scrollAnchor: z.string().nullable(),
  readingMode: readingModeSchema,
  pageLayout: pageLayoutSchema,
  readingDirection: readingDirectionSchema,
  updatedAt: z.iso.datetime(),
});

export const saveReadingProgressRequestSchema = z.object({
  progressType: progressTypeSchema,
  currentPage: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  scrollAnchor: z.string().max(200).nullable().default(null),
  readingMode: readingModeSchema,
  pageLayout: pageLayoutSchema,
  readingDirection: readingDirectionSchema,
  idempotencyKey: z.string().min(8).max(128),
});

export const unitImageManifestSchema = z.object({
  unit: z.object({
    id: z.string().uuid(),
    workId: z.string().uuid(),
    title: z.string().min(1),
    type: unitTypeSchema,
  }),
  images: z.array(unitImageSchema),
  progress: readingProgressSchema.nullable(),
});

export const readingHistoryItemSchema = z.object({
  workId: z.string().uuid(),
  workTitle: z.string().min(1),
  workType: workTypeSchema,
  publicCover: publicCoverSchema,
  unitId: z.string().uuid(),
  unitTitle: z.string().min(1),
  progress: readingProgressSchema,
});

export const recommendationResultSchema = z.object({
  recommendationRequestId: z.string().uuid(),
  algorithmVersion: z.string().min(1),
  coldStart: z.boolean(),
  items: z.array(
    z.object({
      rank: z.number().int().positive(),
      score: z.number(),
      work: workListItemSchema,
    }),
  ),
});

export const contentEventRequestSchema = z.object({
  eventType: z.enum(["impression", "click"]),
  workId: z.string().uuid(),
  recommendationRequestId: z.string().uuid(),
  placement: z.enum(["recommendations", "rankings"]),
  idempotencyKey: z.string().min(8).max(128),
});

export type UnitImageManifest = z.infer<typeof unitImageManifestSchema>;
export type ReadingProgress = z.infer<typeof readingProgressSchema>;
export type SaveReadingProgressRequest = z.infer<typeof saveReadingProgressRequestSchema>;
export type ReadingHistoryItem = z.infer<typeof readingHistoryItemSchema>;
export type RecommendationResult = z.infer<typeof recommendationResultSchema>;
export type ContentEventRequest = z.infer<typeof contentEventRequestSchema>;
