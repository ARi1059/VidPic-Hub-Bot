import { Readable, Transform } from "node:stream";

import {
  BadGatewayException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { ServerEnvironment } from "@film-bot/config";
import type { Database } from "@film-bot/database";
import { mediaAssets, works } from "@film-bot/database";
import { and, eq } from "drizzle-orm";
import type { FastifyReply } from "fastify";

import { MediaSigningService } from "./media-signing.service.js";
import { ContentService } from "../content/content.service.js";
import { DATABASE_CONNECTION, SERVER_ENVIRONMENT } from "../tokens.js";

interface TelegramFileResponse {
  ok: boolean;
  result?: { file_path?: string };
}

@Controller("media")
export class MediaController {
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
    @Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment,
    @Inject(MediaSigningService) private readonly signing: MediaSigningService,
    @Inject(ContentService) private readonly content: ContentService,
  ) {}

  @Get("images/:assetId")
  public async protectedImage(
    @Param("assetId") assetId: string,
    @Query("user") userId: string | undefined,
    @Query("expires") expiresValue: string | undefined,
    @Query("signature") signature: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const expires = Number(expiresValue);
    if (
      !userId ||
      !signature ||
      !this.signing.verifyProtectedImage(assetId, userId, expires, signature)
    ) {
      throw new UnauthorizedException({ code: "AUTH_INVALID", message: "图片签名无效或已过期" });
    }
    const asset = await this.content.getProtectedImageAsset(assetId, userId);
    await this.streamTelegramFile(asset, reply);
  }

  @Get("thumbnails/:assetId")
  public async publicCover(
    @Param("assetId") assetId: string,
    @Query("expires") expiresValue: string | undefined,
    @Query("signature") signature: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const expires = Number(expiresValue);
    if (!signature || !this.signing.verify(assetId, expires, signature)) {
      throw new UnauthorizedException({ code: "AUTH_INVALID", message: "图片签名无效或已过期" });
    }

    const [asset] = await this.database
      .select({
        fileId: mediaAssets.fileId,
        mimeType: mediaAssets.mimeType,
        fileSize: mediaAssets.fileSize,
      })
      .from(mediaAssets)
      .innerJoin(works, eq(works.publicCoverAssetId, mediaAssets.id))
      .where(
        and(
          eq(mediaAssets.id, assetId),
          eq(mediaAssets.status, "available"),
          eq(mediaAssets.presentationScope, "public_preview"),
          eq(works.publicationStatus, "published"),
        ),
      )
      .limit(1);
    if (!asset || (asset.fileSize !== null && asset.fileSize > this.environment.MEDIA_MAX_BYTES)) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "公开封面不存在" });
    }

    await this.streamTelegramFile(asset, reply);
  }

  private async streamTelegramFile(
    asset: { fileId: string; mimeType: string | null; fileSize: number | null },
    reply: FastifyReply,
  ): Promise<void> {
    if (
      !isAllowedImage(asset.mimeType) ||
      (asset.fileSize ?? 0) > this.environment.MEDIA_MAX_BYTES
    ) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "图片不存在" });
    }

    const metadataResponse = await fetchTelegram(
      `https://api.telegram.org/bot${this.environment.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(asset.fileId)}`,
      this.environment.MEDIA_UPSTREAM_TIMEOUT_MS,
      "Telegram 图片地址获取失败",
    );
    if (!metadataResponse.ok) {
      throw new BadGatewayException({
        code: "MEDIA_UNAVAILABLE",
        message: "Telegram 图片暂时不可用",
      });
    }
    const metadata = (await metadataResponse.json()) as TelegramFileResponse;
    const filePath = metadata.result?.file_path;
    if (!metadata.ok || !filePath) {
      throw new BadGatewayException({
        code: "MEDIA_UNAVAILABLE",
        message: "Telegram 图片地址获取失败",
      });
    }

    const mediaController = new AbortController();
    const mediaTimeout = setTimeout(
      () => mediaController.abort(),
      this.environment.MEDIA_UPSTREAM_TIMEOUT_MS,
    );
    let mediaResponse: Response;
    try {
      mediaResponse = await fetch(
        `https://api.telegram.org/file/bot${this.environment.BOT_TOKEN}/${filePath}`,
        { signal: mediaController.signal },
      );
    } catch {
      clearTimeout(mediaTimeout);
      throw new BadGatewayException({
        code: "MEDIA_UNAVAILABLE",
        message: "Telegram 图片读取失败",
      });
    }
    if (!mediaResponse.ok || !mediaResponse.body) {
      clearTimeout(mediaTimeout);
      throw new BadGatewayException({
        code: "MEDIA_UNAVAILABLE",
        message: "Telegram 图片读取失败",
      });
    }

    const contentLength = mediaResponse.headers.get("content-length");
    const parsedContentLength = contentLength === null ? null : Number(contentLength);
    if (
      parsedContentLength !== null &&
      (!Number.isSafeInteger(parsedContentLength) ||
        parsedContentLength < 0 ||
        parsedContentLength > this.environment.MEDIA_MAX_BYTES)
    ) {
      clearTimeout(mediaTimeout);
      mediaController.abort();
      throw new BadGatewayException({
        code: "MEDIA_UNAVAILABLE",
        message: "图片超过浏览限制",
      });
    }
    if (parsedContentLength !== null) reply.header("content-length", String(parsedContentLength));
    let receivedBytes = 0;
    const limitedStream = Readable.fromWeb(mediaResponse.body).pipe(
      new Transform({
        transform: (chunk: Buffer | string, _encoding, callback) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > this.environment.MEDIA_MAX_BYTES) {
            mediaController.abort();
            callback(new Error("Telegram image exceeds configured limit"));
            return;
          }
          callback(null, buffer);
        },
      }),
    );
    const cleanup = () => {
      clearTimeout(mediaTimeout);
      mediaController.abort();
    };
    limitedStream.once("close", cleanup);
    limitedStream.once("error", cleanup);
    reply
      .header(
        "content-type",
        asset.mimeType ?? mediaResponse.headers.get("content-type") ?? "image/jpeg",
      )
      .header("cache-control", "private, max-age=120")
      .header("content-disposition", "inline")
      .header("x-content-type-options", "nosniff")
      .send(limitedStream);
  }
}

function isAllowedImage(mimeType: string | null): boolean {
  return new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]).has(
    mimeType?.toLowerCase() ?? "",
  );
}

async function fetchTelegram(url: string, timeoutMs: number, message: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    throw new BadGatewayException({ code: "MEDIA_UNAVAILABLE", message });
  } finally {
    clearTimeout(timeout);
  }
}
