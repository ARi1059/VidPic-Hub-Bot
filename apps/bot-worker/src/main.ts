import { createHash } from "node:crypto";

import { parseServerEnvironment } from "@film-bot/config";
import {
  createDatabase,
  adminAccounts,
  ingestionItems,
  membershipConversionEvents,
  membershipCtaTokens,
  users,
} from "@film-bot/database";
import { and, eq, gt, inArray } from "drizzle-orm";
import Fastify from "fastify";
import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { Redis } from "ioredis";

import { createDeliveryWorker } from "./delivery-worker.js";

const environment = parseServerEnvironment(process.env);
const { db, close: closeDatabase } = createDatabase(environment.DATABASE_URL);
const redis = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
const bot = new Bot(environment.BOT_TOKEN);
const server = Fastify({ logger: true });

bot.command("start", async (context) => {
  if (!context.from) return;
  const displayName = [context.from.first_name, context.from.last_name].filter(Boolean).join(" ");
  const [user] = await db
    .insert(users)
    .values({
      telegramUserId: BigInt(context.from.id),
      username: context.from.username,
      displayName,
      languageCode: context.from.language_code,
      botStartedAt: new Date(),
      botSendStatus: "available",
      botSendStatusCheckedAt: new Date(),
      lastActiveAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.telegramUserId,
      set: {
        username: context.from.username,
        displayName,
        botStartedAt: new Date(),
        botSendStatus: "available",
        botSendStatusCheckedAt: new Date(),
        botSendFailureReason: null,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!user) return;
  const startParameter = typeof context.match === "string" ? context.match : "";
  if (startParameter.startsWith("member_")) {
    const rawToken = startParameter.slice("member_".length);
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const [ctaToken] = await db
      .select()
      .from(membershipCtaTokens)
      .where(
        and(
          eq(membershipCtaTokens.tokenHash, tokenHash),
          eq(membershipCtaTokens.userId, user.id),
          inArray(membershipCtaTokens.status, ["active", "opened"]),
          gt(membershipCtaTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (ctaToken) {
      await db
        .insert(membershipConversionEvents)
        .values({
          userId: user.id,
          workId: ctaToken.workId,
          eventType: "membership_cta_open",
          sourcePlacement: ctaToken.sourcePlacement,
          recommendationRequestId: ctaToken.recommendationRequestId,
          tokenHash,
          idempotencyKey: `cta-open:${tokenHash}`,
        })
        .onConflictDoNothing();
      await db
        .update(membershipCtaTokens)
        .set({ status: "opened" })
        .where(eq(membershipCtaTokens.id, ctaToken.id));
      await context.reply("会员开通入口已确认。请按说明联系管理员完成开通。", {
        reply_markup: new InlineKeyboard().webApp("返回内容库", environment.MINI_APP_URL),
      });
      return;
    }
  }

  await context.reply("内容库已连接。你可以打开 Mini App 浏览作品并选择要播放的内容。", {
    reply_markup: new InlineKeyboard().webApp("打开内容库", environment.MINI_APP_URL),
  });
});

bot.on("channel_post", async (context) => {
  const message = context.channelPost;
  if (String(message.chat.id) !== environment.TELEGRAM_STORAGE_CHAT_ID) return;
  const metadata = extractIngestionMetadata(message);
  if (!metadata) return;

  await db
    .insert(ingestionItems)
    .values({
      storageChatId: BigInt(message.chat.id),
      sourceMessageId: message.message_id,
      mediaMetadata: metadata,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [ingestionItems.storageChatId, ingestionItems.sourceMessageId],
      set: { mediaMetadata: metadata, updatedAt: new Date() },
    });
});

bot.command("admin", async (context) => {
  if (!context.from) return;
  const [administrator] = await db
    .select({ active: adminAccounts.active })
    .from(adminAccounts)
    .where(eq(adminAccounts.telegramUserId, BigInt(context.from.id)))
    .limit(1);
  if (administrator?.active !== true) return;

  await context.reply("打开内容管理台", {
    reply_markup: new InlineKeyboard().webApp("进入管理台", environment.ADMIN_APP_URL),
  });
});

bot.catch(({ error }) => server.log.error(error, "Telegram update failed"));

server.get("/health", async () => ({ status: "ok", service: "bot-worker" }));

if (environment.BOT_USE_WEBHOOK) {
  server.post(
    "/telegram/webhook",
    webhookCallback(bot, "fastify", { secretToken: environment.TELEGRAM_WEBHOOK_SECRET }),
  );
} else {
  void bot.start({
    onStart: (information) =>
      server.log.info({ username: information.username }, "Bot polling started"),
  });
}

const deliveryWorker = createDeliveryWorker(db, bot, redis, environment.MINI_APP_URL);
deliveryWorker.on("failed", (job, error) => {
  server.log.error({ jobId: job?.id, error }, "Media delivery job failed");
});

await server.listen({ port: environment.BOT_WORKER_PORT, host: "0.0.0.0" });

const shutdown = async () => {
  await deliveryWorker.close();
  await bot.stop();
  await redis.quit();
  await closeDatabase();
  await server.close();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

function extractIngestionMetadata(message: {
  video?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    width: number;
    height: number;
    duration: number;
  };
  document?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
  };
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    width: number;
    height: number;
  }>;
}): Record<string, unknown> | null {
  if (message.video) {
    return {
      type: "video",
      fileId: message.video.file_id,
      fileUniqueId: message.video.file_unique_id,
      fileName: message.video.file_name,
      mimeType: message.video.mime_type ?? "video/mp4",
      fileSize: message.video.file_size,
      width: message.video.width,
      height: message.video.height,
      durationSeconds: message.video.duration,
    };
  }
  if (message.photo && message.photo.length > 0) {
    const photo = message.photo.toSorted(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (!photo) return null;
    return {
      type: "image",
      fileId: photo.file_id,
      fileUniqueId: photo.file_unique_id,
      mimeType: "image/jpeg",
      fileSize: photo.file_size,
      width: photo.width,
      height: photo.height,
    };
  }
  if (message.document) {
    const mimeType = message.document.mime_type ?? "application/octet-stream";
    const type = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : "file";
    return {
      type,
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      fileName: message.document.file_name,
      mimeType,
      fileSize: message.document.file_size,
    };
  }
  return null;
}
