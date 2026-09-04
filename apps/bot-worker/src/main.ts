import { createHash } from "node:crypto";

import { parseServerEnvironment } from "@film-bot/config";
import { detectArchiveFormat } from "@film-bot/contracts";
import {
  createDatabase,
  adminAccounts,
  ingestionItems,
  membershipConversionEvents,
  membershipCtaTokens,
  users,
} from "@film-bot/database";
import { and, eq, gt, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import Fastify from "fastify";
import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { Redis } from "ioredis";

import { createDeliveryWorker } from "./delivery-worker.js";

const environment = parseServerEnvironment(process.env);
const { db, close: closeDatabase } = createDatabase(environment.DATABASE_URL);
const redis = new Redis(environment.REDIS_URL, { maxRetriesPerRequest: null });
const bot = new Bot(environment.BOT_TOKEN);
const server = Fastify({ logger: true });
let transportReady = false;

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
    reply_markup: new InlineKeyboard()
      .webApp("打开内容库", environment.MINI_APP_URL)
      .row()
      .text("使用说明", "help:user"),
  });
});

bot.command("help", async (context) => {
  if (!context.from) return;
  const keyboard = new InlineKeyboard().text("用户说明", "help:user");
  if (await isActiveAdministrator(context.from.id)) {
    keyboard.row().text("管理员说明", "help:admin");
  }
  await context.reply(
    "请选择需要查看的操作说明。用户说明介绍浏览、阅读与视频播放；管理员说明介绍入库、编排和发布。",
    { reply_markup: keyboard },
  );
});

bot.callbackQuery("help:user", async (context) => {
  await context.answerCallbackQuery();
  await context.reply(userHelpText, {
    reply_markup: new InlineKeyboard().webApp("打开 Mini App 说明", miniAppHelpUrl()),
  });
});

bot.callbackQuery("help:admin", async (context) => {
  if (!(await isActiveAdministrator(context.from.id))) {
    await context.answerCallbackQuery({ text: "此说明仅对当前管理员开放", show_alert: true });
    return;
  }
  await context.answerCallbackQuery();
  await context.reply(adminHelpText, {
    reply_markup: new InlineKeyboard().webApp("打开管理台", environment.ADMIN_APP_URL),
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
  server.log.info(
    { sourceMessageId: message.message_id, mediaType: metadata.type },
    "Storage channel media ingested",
  );
});

bot.command("admin", async (context) => {
  if (!context.from) return;
  if (!(await isActiveAdministrator(context.from.id))) return;

  await context.reply("打开内容管理台", {
    reply_markup: new InlineKeyboard()
      .webApp("进入管理台", environment.ADMIN_APP_URL)
      .row()
      .text("管理员说明", "help:admin"),
  });
});

bot.catch(({ error }) => server.log.error(error, "Telegram update failed"));

server.get("/health", async () => ({ status: "ok", service: "bot-worker" }));

server.get("/health/ready", async (_request, reply) => {
  const [database, redisStatus] = await Promise.all([
    dependencyCheck(() => db.execute(sql`select 1`)),
    dependencyCheck(() => redis.ping()),
  ]);
  const checks = { database, redis: redisStatus, transport: transportReady ? "ok" : "failed" };
  if (Object.values(checks).some((status) => status !== "ok")) {
    return reply.status(503).send({
      status: "not_ready",
      service: "bot-worker",
      checks,
      timestamp: new Date().toISOString(),
    });
  }
  return { status: "ok", service: "bot-worker", checks, timestamp: new Date().toISOString() };
});

if (environment.BOT_USE_WEBHOOK) {
  server.post(
    "/telegram/webhook",
    webhookCallback(bot, "fastify", { secretToken: environment.TELEGRAM_WEBHOOK_SECRET }),
  );
}

const deliveryWorker = createDeliveryWorker(db, bot, redis, environment.MINI_APP_URL);
deliveryWorker.on("failed", (job, error) => {
  server.log.error({ jobId: job?.id, error }, "Media delivery job failed");
});

await registerBotCommands();
await configureBotTransport();

await server.listen({ port: environment.BOT_WORKER_PORT, host: "0.0.0.0" });

if (!environment.BOT_USE_WEBHOOK) {
  void bot.start({
    onStart: (information) => {
      transportReady = true;
      server.log.info({ username: information.username }, "Bot polling started");
    },
  });
}

let shutdownPromise: Promise<void> | undefined;
const shutdown = () => {
  if (shutdownPromise) return shutdownPromise;
  transportReady = false;
  shutdownPromise = (async () => {
    if (!environment.BOT_USE_WEBHOOK) await bot.stop();
    await server.close();
    await deliveryWorker.close();
    await redis.quit();
    await closeDatabase();
  })();
  return shutdownPromise;
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
    const archiveFormat = detectArchiveFormat(message.document.file_name, mimeType);
    const type = archiveFormat
      ? "archive"
      : mimeType.startsWith("image/")
        ? "image"
        : mimeType.startsWith("video/")
          ? "video"
          : "file";
    return {
      type,
      ...(archiveFormat ? { archiveFormat } : {}),
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      fileName: message.document.file_name,
      mimeType,
      fileSize: message.document.file_size,
    };
  }
  return null;
}

async function isActiveAdministrator(telegramUserId: number) {
  const [administrator] = await db
    .select({ active: adminAccounts.active })
    .from(adminAccounts)
    .where(eq(adminAccounts.telegramUserId, BigInt(telegramUserId)))
    .limit(1);
  return administrator?.active === true;
}

async function registerBotCommands() {
  const commands = [
    { command: "start", description: "启动 Bot 并打开内容库" },
    { command: "help", description: "查看操作说明" },
    { command: "admin", description: "打开管理员入口" },
  ];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await bot.api.setMyCommands(commands);
      return;
    } catch (error) {
      server.log.warn(
        { attempt, message: error instanceof Error ? error.message : String(error) },
        "Telegram command registration failed",
      );
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
}

function miniAppHelpUrl() {
  const url = new URL(environment.MINI_APP_URL);
  url.searchParams.set("view", "help");
  return url.toString();
}

async function configureBotTransport(): Promise<void> {
  if (environment.BOT_USE_WEBHOOK) {
    const webhookUrl = new URL("/telegram/webhook", environment.PUBLIC_API_URL).toString();
    await bot.api.setWebhook(webhookUrl, {
      secret_token: environment.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query", "channel_post"],
    });
    const webhook = await bot.api.getWebhookInfo();
    if (webhook.url !== webhookUrl) {
      throw new Error(`Telegram webhook verification failed: expected ${webhookUrl}`);
    }
    transportReady = true;
    server.log.info({ webhookUrl }, "Bot webhook registered");
    return;
  }

  await bot.api.deleteWebhook({ drop_pending_updates: false });
  server.log.info("Telegram webhook cleared before polling");
}

async function dependencyCheck(check: () => Promise<unknown>): Promise<"ok" | "failed"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>(
        (_, reject) => (timer = setTimeout(() => reject(new Error("dependency timeout")), 1500)),
      ),
    ]);
    return "ok";
  } catch {
    return "failed";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const userHelpText = `用户操作说明

1. 浏览内容
点击“打开 Mini App 说明”进入内容库。首页提供推荐、排行和最近更新；“分类”可按影视、漫画、图集、写真筛选和搜索；作品详情可收藏。

2. 查看图片
打开作品后选择已发布的图集、写真或漫画目录。图集可滑动、缩放和查看缩略图；漫画可连续滚动或单页阅读，进度会自动保存。作品没有的内容类型不会显示。

3. 播放视频
在影视或写真花絮中选择视频并点击发送。返回 Bot 私聊后，使用 Telegram 原生播放器观看。发送成功的视频消息不会自动删除，但会限制转发和保存。

4. 会员内容
普通用户可看到会员作品的基础资料和会员标识，但不能打开会员目录或文件；会员有效时可浏览全部已发布内容。

5. 常见问题
提示未启动 Bot 时，请先发送 /start；发送失败时可在“我的 > 最近发送”查看状态并重试；页面异常时关闭 Mini App 后重新打开。`;

const adminHelpText = `管理员操作说明

1. 在管理台新建作品草稿，填写名称、主类型、权限和选填资料。
2. 在“作品编排”中创建与主类型匹配的目录和内容单元。
3. 将图片或视频发送到 Telegram 私有存储频道，等待其出现在“待入库”。
4. 在“待入库”中关联目标作品或单元。图片正文需设置逻辑资源 ID 和浏览/缩略版本；公开封面必须作为独立公开预览资源关联。
5. 返回作品编排核对媒体，将正确资源设为“可用”，再将需要公开的目录和内容单元设为“发布”。
6. 点击“审核并发布”。系统会检查独立公开封面、已发布目录、已发布单元和可用媒体；按提示补齐后再次发布。
7. “用户与会员”用于开通或关闭会员；“审计日志”用于核对管理操作；“系统设置”可切换全局会员权限。

内容规则：漫画仅使用漫画章节和图片；影视可包含播放、剧集和剧照；写真可包含写真集、图片集和拍摄花絮。单个具备权限的管理员可独立完成审核与发布。`;
