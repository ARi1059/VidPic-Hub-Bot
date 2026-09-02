import { describe, expect, it } from "vitest";

import { isValidPublicCover, selectHighestResolutionVideo } from "./media.js";

describe("media selection", () => {
  it("chooses the highest available resolution and primary on a tie", () => {
    const selected = selectHighestResolutionVideo([
      { id: "1080-secondary", width: 1920, height: 1080, isPrimary: false, status: "available" },
      { id: "720", width: 1280, height: 720, isPrimary: true, status: "available" },
      { id: "1080-primary", width: 1920, height: 1080, isPrimary: true, status: "available" },
      { id: "4k-invalid", width: 3840, height: 2160, isPrimary: true, status: "invalid" },
    ]);

    expect(selected?.id).toBe("1080-primary");
  });

  it("only accepts a public browse or thumbnail image as public cover", () => {
    expect(
      isValidPublicCover({
        mediaType: "image",
        variant: "browse",
        presentationScope: "public_preview",
        status: "available",
      }),
    ).toBe(true);
    expect(
      isValidPublicCover({
        mediaType: "image",
        variant: "source",
        presentationScope: "protected_content",
        status: "available",
      }),
    ).toBe(false);
  });
});
