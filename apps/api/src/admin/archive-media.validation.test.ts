import { describe, expect, it } from "vitest";

import { validateArchiveMediaInput } from "./admin.service.js";

const archiveRuleId = "00000000-0000-4000-8000-000000000721";

describe("archive media validation", () => {
  it("accepts only a protected archive source with a selected sort rule", () => {
    expect(() =>
      validateArchiveMediaInput({
        type: "archive",
        role: "archive_source",
        presentationScope: "protected_content",
        logicalAssetId: null,
        archiveSortRuleId: archiveRuleId,
        variant: null,
      }),
    ).not.toThrow();
  });

  it("rejects archive resources that could be exposed or treated as image pages", () => {
    expect(() =>
      validateArchiveMediaInput({
        type: "archive",
        role: "browse_image",
        presentationScope: "public_preview",
        logicalAssetId: archiveRuleId,
        archiveSortRuleId: archiveRuleId,
        variant: "browse",
      }),
    ).toThrow("压缩包入库角色必须为 archive_source");
  });

  it("rejects sort-rule references on non-archive media", () => {
    expect(() =>
      validateArchiveMediaInput({
        type: "image",
        role: "browse_image",
        presentationScope: "protected_content",
        logicalAssetId: null,
        archiveSortRuleId: archiveRuleId,
        variant: "browse",
      }),
    ).toThrow("只有压缩包导入源可以关联图片排序规则");
  });
});
