import { z } from "zod";

import { accessLevelSchema, accessStateSchema, publicationStatusSchema } from "./access.js";

export const workTypeSchema = z.enum(["video", "comic", "gallery", "photoshoot"]);
export type WorkType = z.infer<typeof workTypeSchema>;

export const sectionTypeSchema = z.enum([
  "play",
  "episodes",
  "stills",
  "comic_catalog",
  "gallery",
  "photoshoot",
  "behind_the_scenes",
]);
export type SectionType = z.infer<typeof sectionTypeSchema>;

export const unitTypeSchema = z.enum([
  "movie",
  "episode",
  "short_video",
  "comic_chapter",
  "image_set",
  "photoshoot_set",
  "behind_the_scenes_video",
]);
export type UnitType = z.infer<typeof unitTypeSchema>;

export const allowedUnitTypes: Readonly<Record<WorkType, readonly UnitType[]>> = {
  video: ["movie", "episode", "short_video", "image_set"],
  comic: ["comic_chapter"],
  gallery: ["image_set"],
  photoshoot: ["photoshoot_set", "image_set", "behind_the_scenes_video"],
};

export function isUnitTypeAllowed(workType: WorkType, unitType: UnitType): boolean {
  return allowedUnitTypes[workType].includes(unitType);
}

export const publicCoverSchema = z.object({
  assetId: z.string().uuid(),
  url: z.string().url(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export const membershipCtaSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  expiresAt: z.iso.datetime(),
});

export const workMetadataSchema = z.object({
  originalTitle: z.string(),
  aliases: z.array(z.string()),
  region: z.string(),
  year: z.union([z.number().int().min(1800).max(3000), z.literal("未知")]),
  releaseDate: z.string(),
  language: z.string(),
  tags: z.array(z.string()),
  releaseStatus: z.string(),
  contentRating: z.string(),
  directors: z.array(z.string()),
  actors: z.array(z.string()),
  screenwriters: z.array(z.string()),
  producers: z.array(z.string()),
  productionCompanies: z.array(z.string()),
  totalEpisodes: z.union([z.number().int().positive(), z.literal("未知")]),
  durationSeconds: z.union([z.number().int().positive(), z.literal("未知")]),
  authors: z.array(z.string()),
  originalAuthors: z.array(z.string()),
  artists: z.array(z.string()),
  publisher: z.string(),
  serializationPlatform: z.string(),
  serializationStatus: z.string(),
  photographers: z.array(z.string()),
  subjects: z.array(z.string()),
  studio: z.string(),
  shootDate: z.string(),
  location: z.string(),
  volumeCount: z.union([z.number().int().positive(), z.literal("未知")]),
});

export const catalogUnitSchema = z.object({
  id: z.string().uuid(),
  type: unitTypeSchema,
  title: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  accessLevel: accessLevelSchema.nullable(),
  publicationStatus: publicationStatusSchema,
});
export type CatalogUnit = z.infer<typeof catalogUnitSchema>;

export const catalogSectionSchema = z.object({
  id: z.string().uuid(),
  type: sectionTypeSchema,
  title: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
  units: z.array(catalogUnitSchema),
});
export type CatalogSection = z.infer<typeof catalogSectionSchema>;

const workSummaryShape = {
  id: z.string().uuid(),
  type: workTypeSchema,
  subtype: z.string().nullable(),
  title: z.string().min(1),
  summary: z.string().nullable(),
  accessLevel: accessLevelSchema.nullable(),
  accessState: accessStateSchema,
  publicCover: publicCoverSchema,
  metadata: workMetadataSchema,
  memberBadge: z.boolean(),
};

export const unlockedWorkSummarySchema = z.object({
  ...workSummaryShape,
  accessState: z.enum(["full", "partial"]),
  containsMemberContent: z.boolean(),
  membershipCta: membershipCtaSchema.optional(),
});

export const unlockedWorkSchema = z.object({
  ...workSummaryShape,
  accessState: z.enum(["full", "partial"]),
  containsMemberContent: z.boolean(),
  sections: z.array(catalogSectionSchema),
  membershipCta: membershipCtaSchema.optional(),
});

export const lockedWorkSchema = z
  .object({
    ...workSummaryShape,
    accessState: z.literal("locked"),
    memberBadge: z.literal(true),
    membershipCta: membershipCtaSchema,
  })
  .strict();

export const workListItemSchema = z.discriminatedUnion("accessState", [
  unlockedWorkSummarySchema,
  lockedWorkSchema,
]);
export type WorkListItem = z.infer<typeof workListItemSchema>;

export const workDetailSchema = z.discriminatedUnion("accessState", [
  unlockedWorkSchema,
  lockedWorkSchema,
]);
export type WorkDetail = z.infer<typeof workDetailSchema>;

export function displayUnknown(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "未知" : String(value);
}
