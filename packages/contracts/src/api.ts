import { z } from "zod";

export const requestIdSchema = z.string().min(1);

export const apiErrorCodeSchema = z.enum([
  "AUTH_INVALID",
  "AUTH_EXPIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "BOT_NOT_STARTED",
  "BOT_BLOCKED",
  "MEMBERSHIP_REQUIRED",
  "MEDIA_UNAVAILABLE",
  "SERVICE_NOT_READY",
  "RATE_LIMITED",
  "CONFLICT",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  requestId: requestIdSchema,
  details: z.record(z.string(), z.unknown()).optional(),
});

export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z.object({ data, requestId: requestIdSchema });
}

export const telegramAuthRequestSchema = z.object({
  initData: z.string().min(1),
  audience: z.enum(["user", "admin"]).default("user"),
});

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
  user: z.object({
    id: z.string().uuid(),
    telegramUserId: z.string(),
    displayName: z.string(),
    memberActive: z.boolean(),
    admin: z.boolean(),
  }),
});

export const videoDeliveryRequestSchema = z.object({
  unitId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export const mediaDeliveryQueueName = "media-delivery";
export interface MediaDeliveryJob {
  deliveryId: string;
}

export const deliveryStatusSchema = z.enum(["queued", "sending", "succeeded", "failed"]);
export const videoDeliverySchema = z.object({
  id: z.string().uuid(),
  workId: z.string().uuid(),
  unitId: z.string().uuid(),
  workTitle: z.string().min(1),
  unitTitle: z.string().min(1),
  status: deliveryStatusSchema,
  protectedContent: z.boolean(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  targetMessageId: z.number().int().positive().nullable(),
  telegramErrorCode: z.number().int().nullable(),
  telegramErrorDescription: z.string().nullable(),
});

export type VideoDelivery = z.infer<typeof videoDeliverySchema>;
