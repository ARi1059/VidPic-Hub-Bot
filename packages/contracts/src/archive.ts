import { z } from "zod";

export const archiveFormatSchema = z.enum(["zip", "cbz"]);
export type ArchiveFormat = z.infer<typeof archiveFormatSchema>;

export const archiveSortKindSchema = z.enum(["natural", "numeric", "chapter_page", "path"]);
export type ArchiveSortKind = z.infer<typeof archiveSortKindSchema>;

export const archiveSortDirectionSchema = z.enum(["asc", "desc"]);
export type ArchiveSortDirection = z.infer<typeof archiveSortDirectionSchema>;

export const archiveSortRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).nullable(),
  kind: archiveSortKindSchema,
  filePattern: z.string().trim().max(240).nullable(),
  chapterPattern: z.string().trim().max(240).nullable(),
  pagePattern: z.string().trim().max(240).nullable(),
  direction: archiveSortDirectionSchema,
  priority: z.number().int().nonnegative(),
  enabled: z.boolean(),
  system: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ArchiveSortRule = z.infer<typeof archiveSortRuleSchema>;

export const createArchiveSortRuleRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  kind: archiveSortKindSchema,
  filePattern: z.string().trim().max(240).nullable().optional(),
  chapterPattern: z.string().trim().max(240).nullable().optional(),
  pagePattern: z.string().trim().max(240).nullable().optional(),
  direction: archiveSortDirectionSchema.default("asc"),
  priority: z.number().int().nonnegative().max(10_000).default(100),
  enabled: z.boolean().default(true),
});
export type CreateArchiveSortRuleRequest = z.infer<typeof createArchiveSortRuleRequestSchema>;

const archiveExtensions = new Map<string, ArchiveFormat>([
  [".zip", "zip"],
  [".cbz", "cbz"],
]);

export function detectArchiveFormat(
  fileName: string | null | undefined,
  mimeType: string | null | undefined,
): ArchiveFormat | null {
  const normalizedName = fileName?.trim().toLocaleLowerCase() ?? "";
  const extension = normalizedName.slice(normalizedName.lastIndexOf("."));
  const byExtension = archiveExtensions.get(extension);
  if (byExtension) return byExtension;
  if (mimeType === "application/vnd.comicbook+zip" || mimeType === "application/x-cbz")
    return "cbz";
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") return "zip";
  return null;
}

export function isArchiveImagePath(path: string): boolean {
  return /\.(?:jpe?g|png|webp|gif|avif)$/iu.test(path);
}

export function sortArchiveImagePaths(
  paths: readonly string[],
  rule: Pick<
    ArchiveSortRule,
    "kind" | "filePattern" | "chapterPattern" | "pagePattern" | "direction"
  >,
): string[] {
  const selected = paths.filter((path) => {
    if (!isArchiveImagePath(path)) return false;
    if (!rule.filePattern) return true;
    return safeRegExp(rule.filePattern)?.test(path) ?? false;
  });
  const direction = rule.direction === "desc" ? -1 : 1;
  return [...selected].sort((left, right) => {
    const difference = compareArchivePaths(left, right, rule);
    return (
      difference * direction || left.localeCompare(right, undefined, { numeric: true }) * direction
    );
  });
}

function compareArchivePaths(
  left: string,
  right: string,
  rule: Pick<ArchiveSortRule, "kind" | "chapterPattern" | "pagePattern">,
): number {
  if (rule.kind === "path") return left.localeCompare(right, undefined, { numeric: true });
  if (rule.kind === "natural") return left.localeCompare(right, undefined, { numeric: true });
  if (rule.kind === "chapter_page") {
    const leftKey = chapterPageKey(left, rule.chapterPattern, rule.pagePattern);
    const rightKey = chapterPageKey(right, rule.chapterPattern, rule.pagePattern);
    return compareNumberArrays(leftKey, rightKey);
  }
  return compareNumberArrays(numberKey(left), numberKey(right));
}

function chapterPageKey(path: string, chapterPattern: string | null, pagePattern: string | null) {
  const chapter = captureNumber(path, chapterPattern) ?? numberKey(path)[0] ?? 0;
  const page = captureNumber(path, pagePattern) ?? numberKey(path)[1] ?? 0;
  return [chapter, page, ...numberKey(path)];
}

function captureNumber(value: string, pattern: string | null): number | null {
  if (!pattern) return null;
  const expression = safeRegExp(pattern);
  if (!expression) return null;
  const match = expression.exec(value);
  if (!match) return null;
  const candidate = match.groups?.number ?? match[1] ?? match[0];
  const parsed = Number.parseInt(candidate.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberKey(value: string): number[] {
  return [...value.matchAll(/\d+/gu)].map((match) => Number.parseInt(match[0], 10));
}

function compareNumberArrays(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

function safeRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "iu");
  } catch {
    return null;
  }
}
