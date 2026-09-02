import { describe, expect, it } from "vitest";

import {
  validateWorkPublication,
  type PublicationAssetSnapshot,
  type WorkPublicationSnapshot,
} from "./publication.js";

function image(
  id: string,
  logicalAssetId: string,
  variant: PublicationAssetSnapshot["variant"],
  ordinal = 0,
): PublicationAssetSnapshot {
  return {
    id,
    type: variant === "thumbnail" ? "thumbnail" : "image",
    variant,
    presentationScope: "protected_content",
    status: "available",
    logicalAssetId,
    mimeType: "image/jpeg",
    fileSize: 1_000_000,
    width: 1600,
    height: 2400,
    ordinal,
  };
}

function validGallery(): WorkPublicationSnapshot {
  const logicalId = "11111111-1111-4111-8111-111111111111";
  return {
    type: "gallery",
    publicCoverAssetId: "22222222-2222-4222-8222-222222222222",
    publicCover: {
      id: "22222222-2222-4222-8222-222222222222",
      mediaType: "thumbnail",
      variant: "thumbnail",
      presentationScope: "public_preview",
      status: "available",
    },
    sections: [
      {
        id: "section",
        publicationStatus: "published",
        units: [
          {
            id: "unit",
            type: "image_set",
            publicationStatus: "published",
            assets: [
              image("source", logicalId, "source"),
              image("browse", logicalId, "browse"),
              image("thumbnail", logicalId, "thumbnail"),
            ],
          },
        ],
      },
    ],
  };
}

describe("validateWorkPublication", () => {
  it("accepts a complete three-variant image work", () => {
    expect(validateWorkPublication(validGallery())).toEqual([]);
  });

  it("rejects a protected source file as public cover", () => {
    const snapshot = validGallery();
    snapshot.publicCover = {
      id: snapshot.publicCoverAssetId!,
      mediaType: "image",
      variant: "source",
      presentationScope: "protected_content",
      status: "available",
    };
    expect(validateWorkPublication(snapshot).map((issue) => issue.code)).toContain(
      "PUBLIC_COVER_INVALID",
    );
  });

  it("rejects missing image variants and invalid page order", () => {
    const snapshot = validGallery();
    const unit = snapshot.sections[0]?.units[0];
    if (!unit) throw new Error("fixture missing unit");
    unit.assets = [image("browse", "logical", "browse", 2)];

    const codes = validateWorkPublication(snapshot).map((issue) => issue.code);
    expect(codes).toContain("IMAGE_VARIANT_REQUIRED");
    expect(codes).toContain("IMAGE_PAGE_ORDER_INVALID");
  });

  it("rejects video content in comics", () => {
    const snapshot = validGallery();
    snapshot.type = "comic";
    const unit = snapshot.sections[0]?.units[0];
    if (!unit) throw new Error("fixture missing unit");
    unit.type = "comic_chapter";
    unit.assets = [
      {
        id: "video",
        type: "video",
        variant: null,
        presentationScope: "protected_content",
        status: "available",
        logicalAssetId: null,
        mimeType: "video/mp4",
        fileSize: 1_000_000,
        width: 1920,
        height: 1080,
        ordinal: 0,
      },
    ];
    expect(validateWorkPublication(snapshot).map((issue) => issue.code)).toContain(
      "COMIC_VIDEO_FORBIDDEN",
    );
  });
});
