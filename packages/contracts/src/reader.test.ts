import { describe, expect, it } from "vitest";

import { saveReadingProgressRequestSchema, unitImageManifestSchema } from "./reader.js";

describe("reader contracts", () => {
  it("accepts zero-based reading progress", () => {
    expect(
      saveReadingProgressRequestSchema.safeParse({
        progressType: "comic",
        currentPage: 0,
        totalPages: 12,
        scrollAnchor: "page-0",
        readingMode: "continuous",
        pageLayout: "single",
        readingDirection: "rtl",
        idempotencyKey: "progress-0001",
      }).success,
    ).toBe(true);
  });

  it("rejects progress beyond a negative page index", () => {
    expect(
      saveReadingProgressRequestSchema.safeParse({
        progressType: "gallery",
        currentPage: -1,
        totalPages: 3,
        readingMode: "paged",
        pageLayout: "single",
        readingDirection: "ltr",
        idempotencyKey: "progress-0002",
      }).success,
    ).toBe(false);
  });

  it("requires browse images and never models a source URL", () => {
    const result = unitImageManifestSchema.safeParse({
      unit: {
        id: "00000000-0000-4000-8000-000000000001",
        workId: "00000000-0000-4000-8000-000000000002",
        title: "第一章",
        type: "comic_chapter",
      },
      images: [
        {
          logicalAssetId: "00000000-0000-4000-8000-000000000003",
          ordinal: 0,
          browse: {
            assetId: "00000000-0000-4000-8000-000000000004",
            url: "https://example.com/browse",
            width: 1200,
            height: 1800,
            mimeType: "image/jpeg",
          },
          thumbnail: null,
        },
      ],
      progress: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect("source" in result.data.images[0]!).toBe(false);
  });
});
