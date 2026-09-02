import { describe, expect, it } from "vitest";

import { videoDeliveryRequestSchema, videoDeliverySchema } from "./api.js";

describe("video delivery contracts", () => {
  it("accepts a queued protected delivery", () => {
    const result = videoDeliverySchema.parse({
      id: "00000000-0000-4000-8000-000000000001",
      workId: "00000000-0000-4000-8000-000000000002",
      unitId: "00000000-0000-4000-8000-000000000003",
      workTitle: "示例影视",
      unitTitle: "第 1 集",
      status: "queued",
      protectedContent: true,
      createdAt: "2026-09-02T00:00:00.000Z",
      sentAt: null,
      targetMessageId: null,
      telegramErrorCode: null,
      telegramErrorDescription: null,
    });

    expect(result.status).toBe("queued");
    expect(result.protectedContent).toBe(true);
  });

  it("requires a stable idempotency key", () => {
    expect(
      videoDeliveryRequestSchema.safeParse({
        unitId: "00000000-0000-4000-8000-000000000003",
        idempotencyKey: "short",
      }).success,
    ).toBe(false);
  });
});
