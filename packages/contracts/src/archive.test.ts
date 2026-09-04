import { describe, expect, it } from "vitest";

import { detectArchiveFormat, sortArchiveImagePaths } from "./archive.js";

describe("archive contracts", () => {
  it("recognizes ZIP and CBZ source files without recognizing other documents", () => {
    expect(detectArchiveFormat("comic-volume-01.cbz", "application/octet-stream")).toBe("cbz");
    expect(detectArchiveFormat("images.zip", "application/zip")).toBe("zip");
    expect(detectArchiveFormat(undefined, "application/vnd.comicbook+zip")).toBe("cbz");
    expect(detectArchiveFormat("book.pdf", "application/pdf")).toBeNull();
  });

  it("filters non-image archive entries and orders numeric page names", () => {
    expect(
      sortArchiveImagePaths(
        ["chapter-01/page-10.jpg", "chapter-01/page-2.jpg", "notes.txt", "cover.png"],
        {
          kind: "numeric",
          filePattern: null,
          chapterPattern: null,
          pagePattern: null,
          direction: "asc",
        },
      ),
    ).toEqual(["cover.png", "chapter-01/page-2.jpg", "chapter-01/page-10.jpg"]);
  });

  it("uses configured chapter and page captures before natural tie breaking", () => {
    expect(
      sortArchiveImagePaths(["c2/p10.webp", "c10/p1.webp", "c2/p2.webp"], {
        kind: "chapter_page",
        filePattern: null,
        chapterPattern: "c(?<number>\\d+)",
        pagePattern: "p(?<number>\\d+)",
        direction: "asc",
      }),
    ).toEqual(["c2/p2.webp", "c2/p10.webp", "c10/p1.webp"]);
  });
});
