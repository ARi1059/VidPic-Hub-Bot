import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PreconditionFailedException,
} from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import type { ServerEnvironment } from "@film-bot/config";
import {
  mediaDeliveryQueueName,
  selectHighestResolutionVideo,
  type MediaDeliveryJob,
  type VideoDelivery,
} from "@film-bot/contracts";
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
import { Queue } from "bullmq";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Redis } from "ioredis";

import { DATABASE_CONNECTION, SERVER_ENVIRONMENT } from "../tokens.js";

const videoUnitTypes = new Set(["movie", "episode", "short_video", "behind_the_scenes_video"]);
const MAX_ACTIVE_DELIVERIES = 2;
const MAX_DELIVERIES_PER_MINUTE = 5;

@Injectable()
export class DeliveryService implements OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly queue: Queue<MediaDeliveryJob>;

  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
    @Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment,
  ) {
    this.redis = new Redis(this.environment.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue<MediaDeliveryJob>(mediaDeliveryQueueName, { connection: this.redis });
  }

  public async createVideo(input: { userId: string; unitId: string; idempotencyKey: string }) {
    const existing = await this.findByIdempotencyKey(input.userId, input.idempotencyKey);
    if (existing) {
      if (existing.unitId !== input.unitId) {
        throw new ConflictException({
          code: "CONFLICT",
          message: "幂等键已用于其他视频",
        });
      }
      return deliveryDto(existing);
    }

    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!user || user.status !== "active") {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "账号当前不可用" });
    }
    const botStartUrl = `https://t.me/${this.environment.BOT_USERNAME}?start=miniapp`;
    if (
      !user.botStartedAt ||
      user.botSendStatus === "unknown" ||
      user.botSendStatus === "not_started"
    ) {
      throw new PreconditionFailedException({
        code: "BOT_NOT_STARTED",
        message: "请先启动 Bot，再发送视频",
        details: { startUrl: botStartUrl },
      });
    }
    if (user.botSendStatus === "blocked") {
      throw new ForbiddenException({
        code: "BOT_BLOCKED",
        message: "Bot 当前无法向你发送消息，请解除屏蔽后重新启动 Bot",
        details: { startUrl: botStartUrl },
      });
    }

    const [unit] = await this.database
      .select({
        unitId: contentUnits.id,
        unitTitle: contentUnits.title,
        unitType: contentUnits.type,
        unitStatus: contentUnits.publicationStatus,
        unitAccessLevel: contentUnits.accessLevel,
        sectionStatus: contentSections.publicationStatus,
        sectionAccessLevel: contentSections.accessLevel,
        workId: works.id,
        workTitle: works.title,
        workStatus: works.publicationStatus,
        workAccessLevel: works.accessLevel,
      })
      .from(contentUnits)
      .innerJoin(contentSections, eq(contentSections.id, contentUnits.sectionId))
      .innerJoin(works, eq(works.id, contentSections.workId))
      .where(eq(contentUnits.id, input.unitId))
      .limit(1);
    if (
      !unit ||
      unit.unitStatus !== "published" ||
      unit.sectionStatus !== "published" ||
      unit.workStatus !== "published" ||
      !videoUnitTypes.has(unit.unitType)
    ) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "视频内容不存在" });
    }

    const [settings] = await this.database
      .select({ membershipEnabled: systemSettings.membershipEnabled })
      .from(systemSettings)
      .limit(1);
    const memberActive =
      user.memberActive && (!user.memberExpiresAt || user.memberExpiresAt.getTime() > Date.now());
    if (
      !canAccess(
        unit.unitAccessLevel,
        unit.sectionAccessLevel,
        unit.workAccessLevel,
        settings?.membershipEnabled ?? true,
        memberActive,
      )
    ) {
      throw new ForbiddenException({ code: "MEMBERSHIP_REQUIRED", message: "需要会员权限" });
    }

    const assets = await this.database
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.unitId, input.unitId), eq(mediaAssets.type, "video")));
    const selected = selectHighestResolutionVideo(assets);
    if (!selected) {
      throw new ConflictException({ code: "MEDIA_UNAVAILABLE", message: "视频资源暂不可用" });
    }

    await this.assertRateLimit(input.userId);
    const [created] = await this.database
      .insert(mediaDeliveries)
      .values({
        userId: input.userId,
        workId: unit.workId,
        unitId: unit.unitId,
        mediaAssetId: selected.id,
        sourceChatId: assets.find((asset) => asset.id === selected.id)!.storageChatId,
        sourceMessageId: assets.find((asset) => asset.id === selected.id)!.sourceMessageId,
        targetChatId: user.telegramUserId,
        protectedContent: true,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const raced = await this.findByIdempotencyKey(input.userId, input.idempotencyKey);
      if (raced?.unitId === input.unitId) return deliveryDto(raced);
      throw new ConflictException({ code: "CONFLICT", message: "发送请求发生冲突" });
    }

    try {
      await this.queue.add(
        "video",
        { deliveryId: created.id },
        {
          jobId: created.id,
          attempts: 4,
          backoff: { type: "exponential", delay: 1_500 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      );
    } catch {
      await this.database
        .update(mediaDeliveries)
        .set({
          status: "failed",
          telegramErrorDescription: "QUEUE_UNAVAILABLE",
          updatedAt: new Date(),
        })
        .where(eq(mediaDeliveries.id, created.id));
      throw new InternalServerErrorException({
        code: "INTERNAL_ERROR",
        message: "视频发送队列暂不可用",
      });
    }

    return deliveryDto({ ...created, workTitle: unit.workTitle, unitTitle: unit.unitTitle });
  }

  public async get(userId: string, deliveryId: string): Promise<VideoDelivery> {
    const [delivery] = await this.deliveryRows(
      and(eq(mediaDeliveries.id, deliveryId), eq(mediaDeliveries.userId, userId)),
      1,
    );
    if (!delivery) throw new NotFoundException({ code: "NOT_FOUND", message: "发送任务不存在" });
    return deliveryDto(delivery);
  }

  public async listRecent(userId: string): Promise<VideoDelivery[]> {
    const rows = await this.deliveryRows(eq(mediaDeliveries.userId, userId), 20);
    return rows.map(deliveryDto);
  }

  public async onApplicationShutdown() {
    await this.queue.close();
    await this.redis.quit();
  }

  private async findByIdempotencyKey(userId: string, idempotencyKey: string) {
    const [delivery] = await this.deliveryRows(
      and(eq(mediaDeliveries.userId, userId), eq(mediaDeliveries.idempotencyKey, idempotencyKey)),
      1,
    );
    return delivery;
  }

  private deliveryRows(where: ReturnType<typeof eq> | ReturnType<typeof and>, limit: number) {
    return this.database
      .select({
        id: mediaDeliveries.id,
        workId: mediaDeliveries.workId,
        unitId: mediaDeliveries.unitId,
        workTitle: works.title,
        unitTitle: contentUnits.title,
        status: mediaDeliveries.status,
        protectedContent: mediaDeliveries.protectedContent,
        createdAt: mediaDeliveries.createdAt,
        sentAt: mediaDeliveries.sentAt,
        targetMessageId: mediaDeliveries.targetMessageId,
        telegramErrorCode: mediaDeliveries.telegramErrorCode,
        telegramErrorDescription: mediaDeliveries.telegramErrorDescription,
      })
      .from(mediaDeliveries)
      .innerJoin(works, eq(works.id, mediaDeliveries.workId))
      .innerJoin(contentUnits, eq(contentUnits.id, mediaDeliveries.unitId))
      .where(where)
      .orderBy(desc(mediaDeliveries.createdAt))
      .limit(limit);
  }

  private async assertRateLimit(userId: string) {
    const [[active], [recent]] = await Promise.all([
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(mediaDeliveries)
        .where(
          and(
            eq(mediaDeliveries.userId, userId),
            inArray(mediaDeliveries.status, ["queued", "sending"]),
          ),
        ),
      this.database
        .select({ count: sql<number>`count(*)::int` })
        .from(mediaDeliveries)
        .where(
          and(
            eq(mediaDeliveries.userId, userId),
            gte(mediaDeliveries.createdAt, new Date(Date.now() - 60_000)),
          ),
        ),
    ]);
    if (
      (active?.count ?? 0) >= MAX_ACTIVE_DELIVERIES ||
      (recent?.count ?? 0) >= MAX_DELIVERIES_PER_MINUTE
    ) {
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "发送请求过于频繁，请稍后再试",
          details: { retryAfterSeconds: 60 },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function deliveryDto(delivery: {
  id: string;
  workId: string;
  unitId: string;
  workTitle: string;
  unitTitle: string;
  status: "queued" | "sending" | "succeeded" | "failed";
  protectedContent: boolean;
  createdAt: Date;
  sentAt: Date | null;
  targetMessageId: number | null;
  telegramErrorCode: number | null;
  telegramErrorDescription: string | null;
}): VideoDelivery {
  return {
    ...delivery,
    createdAt: delivery.createdAt.toISOString(),
    sentAt: delivery.sentAt?.toISOString() ?? null,
  };
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
