import { mediaDeliveryQueueName, type MediaDeliveryJob } from "@film-bot/contracts";
import type { Database } from "@film-bot/database";
import {
  contentSections,
  contentUnits,
  mediaAssets,
  mediaDeliveries,
  systemSettings,
  users,
  works,
} from "@film-bot/database";
import { type Job, Worker } from "bullmq";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Bot } from "grammy";
import { GrammyError, HttpError, InlineKeyboard } from "grammy";
import type { Redis } from "ioredis";

const videoUnitTypes = ["movie", "episode", "short_video", "behind_the_scenes_video"] as const;

export function createDeliveryWorker(
  database: Database,
  bot: Bot,
  redis: Redis,
  miniAppUrl: string,
): Worker<MediaDeliveryJob> {
  return new Worker<MediaDeliveryJob>(
    mediaDeliveryQueueName,
    async (job: Job<MediaDeliveryJob>) => {
      const [delivery] = await database
        .select({
          id: mediaDeliveries.id,
          status: mediaDeliveries.status,
          sourceChatId: mediaDeliveries.sourceChatId,
          sourceMessageId: mediaDeliveries.sourceMessageId,
          targetChatId: mediaDeliveries.targetChatId,
          workId: mediaDeliveries.workId,
          workTitle: works.title,
          mediaStatus: mediaAssets.status,
          mediaType: mediaAssets.type,
          mediaUnitId: mediaAssets.unitId,
          userId: mediaDeliveries.userId,
          unitId: mediaDeliveries.unitId,
          unitTitle: contentUnits.title,
          unitOrdinal: contentUnits.ordinal,
          unitType: contentUnits.type,
          unitStatus: contentUnits.publicationStatus,
          unitAccessLevel: contentUnits.accessLevel,
          sectionId: contentSections.id,
          sectionStatus: contentSections.publicationStatus,
          sectionAccessLevel: contentSections.accessLevel,
          workStatus: works.publicationStatus,
          workAccessLevel: works.accessLevel,
          userStatus: users.status,
          memberActive: users.memberActive,
          memberExpiresAt: users.memberExpiresAt,
          botStartedAt: users.botStartedAt,
          botSendStatus: users.botSendStatus,
        })
        .from(mediaDeliveries)
        .innerJoin(mediaAssets, eq(mediaAssets.id, mediaDeliveries.mediaAssetId))
        .innerJoin(contentUnits, eq(contentUnits.id, mediaDeliveries.unitId))
        .innerJoin(contentSections, eq(contentSections.id, contentUnits.sectionId))
        .innerJoin(works, eq(works.id, mediaDeliveries.workId))
        .innerJoin(users, eq(users.id, mediaDeliveries.userId))
        .where(eq(mediaDeliveries.id, job.data.deliveryId))
        .limit(1);

      if (!delivery || delivery.status === "succeeded") return;
      const [settings] = await database
        .select({ membershipEnabled: systemSettings.membershipEnabled })
        .from(systemSettings)
        .limit(1);
      const memberActive =
        delivery.memberActive &&
        (!delivery.memberExpiresAt || delivery.memberExpiresAt.getTime() > Date.now());
      const contentAvailable =
        delivery.userStatus === "active" &&
        delivery.botStartedAt !== null &&
        delivery.botSendStatus === "available" &&
        delivery.unitStatus === "published" &&
        delivery.sectionStatus === "published" &&
        delivery.workStatus === "published" &&
        videoUnitTypes.includes(delivery.unitType as (typeof videoUnitTypes)[number]) &&
        delivery.mediaType === "video" &&
        delivery.mediaUnitId === delivery.unitId;
      if (!contentAvailable) {
        const failureCode =
          delivery.botSendStatus === "blocked"
            ? "BOT_BLOCKED"
            : !delivery.botStartedAt || delivery.botSendStatus !== "available"
              ? "BOT_NOT_STARTED"
              : "CONTENT_UNAVAILABLE";
        await markFailed(database, delivery.id, failureCode, job.attemptsMade);
        return;
      }
      if (
        !canAccess(
          delivery.unitAccessLevel,
          delivery.sectionAccessLevel,
          delivery.workAccessLevel,
          settings?.membershipEnabled ?? true,
          memberActive,
        )
      ) {
        await markFailed(database, delivery.id, "MEMBERSHIP_REQUIRED", job.attemptsMade);
        return;
      }
      if (delivery.mediaStatus !== "available") {
        await markFailed(database, delivery.id, "MEDIA_UNAVAILABLE", job.attemptsMade);
        return;
      }

      const siblingRows = await database
        .select({ id: contentUnits.id, ordinal: contentUnits.ordinal })
        .from(contentUnits)
        .where(
          and(
            eq(contentUnits.sectionId, delivery.sectionId),
            eq(contentUnits.publicationStatus, "published"),
            inArray(contentUnits.type, [...videoUnitTypes]),
          ),
        )
        .orderBy(asc(contentUnits.ordinal));
      const siblingIndex = siblingRows.findIndex((unit) => unit.id === delivery.unitId);
      const previous = siblingIndex > 0 ? siblingRows[siblingIndex - 1] : undefined;
      const next = siblingIndex >= 0 ? siblingRows[siblingIndex + 1] : undefined;
      const keyboard = deliveryKeyboard(miniAppUrl, delivery.workId, previous?.id, next?.id);

      await database
        .update(mediaDeliveries)
        .set({ status: "sending", retryCount: job.attemptsMade, updatedAt: new Date() })
        .where(eq(mediaDeliveries.id, delivery.id));

      try {
        const copied = await bot.api.copyMessage(
          delivery.targetChatId.toString(),
          delivery.sourceChatId.toString(),
          delivery.sourceMessageId,
          {
            protect_content: true,
            caption: `${delivery.workTitle}\n${delivery.unitTitle}`,
            reply_markup: keyboard,
          },
        );

        await database
          .update(mediaDeliveries)
          .set({
            status: "succeeded",
            targetMessageId: copied.message_id,
            protectedContent: true,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(mediaDeliveries.id, delivery.id));
      } catch (error) {
        const telegramError = error instanceof GrammyError ? error : undefined;
        const blocked = telegramError?.error_code === 403;
        const retriable =
          error instanceof HttpError ||
          telegramError?.error_code === 429 ||
          (telegramError?.error_code ?? 0) >= 500;
        const maxAttempts = job.opts.attempts ?? 1;
        const willRetry = retriable && job.attemptsMade + 1 < maxAttempts;

        await database
          .update(mediaDeliveries)
          .set({
            status: willRetry ? "queued" : "failed",
            telegramErrorCode: telegramError?.error_code,
            telegramErrorDescription: telegramError?.description ?? "BOT_DELIVERY_FAILED",
            retryCount: job.attemptsMade + 1,
            updatedAt: new Date(),
          })
          .where(eq(mediaDeliveries.id, delivery.id));

        if (blocked) {
          await database
            .update(users)
            .set({
              botSendStatus: "blocked",
              botSendStatusCheckedAt: new Date(),
              botSendFailureReason: telegramError.description,
              updatedAt: new Date(),
            })
            .where(eq(users.id, delivery.userId));
          return;
        }

        if (willRetry) throw error;
      }
    },
    {
      connection: redis,
      concurrency: 4,
      lockDuration: 30_000,
    },
  );
}

function deliveryKeyboard(
  miniAppUrl: string,
  workId: string,
  previousUnitId?: string,
  nextUnitId?: string,
) {
  const keyboard = new InlineKeyboard();
  if (previousUnitId) keyboard.webApp("上一集", workUrl(miniAppUrl, workId, previousUnitId));
  if (nextUnitId) keyboard.webApp("下一集", workUrl(miniAppUrl, workId, nextUnitId));
  if (previousUnitId || nextUnitId) keyboard.row();
  return keyboard
    .webApp("重新选集", workUrl(miniAppUrl, workId))
    .webApp("收藏作品", workUrl(miniAppUrl, workId))
    .webApp("作品详情", workUrl(miniAppUrl, workId));
}

function workUrl(miniAppUrl: string, workId: string, unitId?: string) {
  const url = new URL(miniAppUrl);
  url.searchParams.set("work", workId);
  if (unitId) url.searchParams.set("unit", unitId);
  return url.toString();
}

async function markFailed(
  database: Database,
  deliveryId: string,
  failureCode: string,
  retryCount: number,
) {
  await database
    .update(mediaDeliveries)
    .set({
      status: "failed",
      telegramErrorDescription: failureCode,
      retryCount,
      updatedAt: new Date(),
    })
    .where(eq(mediaDeliveries.id, deliveryId));
}

function canAccess(
  unit: "public" | "member" | null,
  section: "public" | "member" | null,
  work: "public" | "member" | null,
  membershipEnabled: boolean,
  memberActive: boolean,
) {
  return !membershipEnabled || memberActive || (unit ?? section ?? work ?? "public") === "public";
}
