import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { contentEventRequestSchema, saveReadingProgressRequestSchema } from "@film-bot/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { ContentService } from "./content.service.js";
import { getRequestSession } from "../auth/session.js";
import { UserSessionGuard } from "../auth/session.guard.js";

const uuidSchema = z.string().uuid();
const idempotencySchema = z.string().min(8).max(128);

@Controller()
@UseGuards(UserSessionGuard)
export class ContentController {
  public constructor(@Inject(ContentService) private readonly content: ContentService) {}

  @Get("units/:unitId/images")
  public images(@Req() request: FastifyRequest, @Param("unitId") unitId: string) {
    const session = getRequestSession(request);
    return this.content.getImageManifest({
      userId: session.userId,
      memberActive: session.memberActive,
      unitId: parse(uuidSchema, unitId, "内容单元 ID 无效"),
    });
  }

  @Put("reading-progress/:unitId")
  public saveProgress(
    @Req() request: FastifyRequest,
    @Param("unitId") unitId: string,
    @Body() body: unknown,
  ) {
    const session = getRequestSession(request);
    return this.content.saveProgress({
      userId: session.userId,
      memberActive: session.memberActive,
      unitId: parse(uuidSchema, unitId, "内容单元 ID 无效"),
      progress: parse(saveReadingProgressRequestSchema, body, "阅读进度无效"),
    });
  }

  @Get("favorites")
  public favorites(@Req() request: FastifyRequest) {
    const session = getRequestSession(request);
    return this.content.listFavorites({
      userId: session.userId,
      memberActive: session.memberActive,
    });
  }

  @Put("favorites/:workId")
  public addFavorite(
    @Req() request: FastifyRequest,
    @Param("workId") workId: string,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.content.setFavorite({
      userId: getRequestSession(request).userId,
      workId: parse(uuidSchema, workId, "作品 ID 无效"),
      idempotencyKey: parse(idempotencySchema, idempotencyKey, "缺少幂等键"),
      favorite: true,
    });
  }

  @Delete("favorites/:workId")
  public removeFavorite(
    @Req() request: FastifyRequest,
    @Param("workId") workId: string,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.content.setFavorite({
      userId: getRequestSession(request).userId,
      workId: parse(uuidSchema, workId, "作品 ID 无效"),
      idempotencyKey: parse(idempotencySchema, idempotencyKey, "缺少幂等键"),
      favorite: false,
    });
  }

  @Get("history")
  public history(@Req() request: FastifyRequest) {
    const session = getRequestSession(request);
    return this.content.listHistory({
      userId: session.userId,
      memberActive: session.memberActive,
    });
  }

  @Get("recommendations")
  public recommendations(@Req() request: FastifyRequest) {
    const session = getRequestSession(request);
    return this.content.recommendations({
      userId: session.userId,
      memberActive: session.memberActive,
      placement: "recommendations",
    });
  }

  @Get("rankings")
  public rankings(@Req() request: FastifyRequest) {
    const session = getRequestSession(request);
    return this.content.recommendations({
      userId: session.userId,
      memberActive: session.memberActive,
      placement: "rankings",
    });
  }

  @Post("events/content")
  public event(@Req() request: FastifyRequest, @Body() body: unknown) {
    const event = parse(contentEventRequestSchema, body, "内容事件无效");
    return this.content.recordRecommendationEvent({
      userId: getRequestSession(request).userId,
      ...event,
    });
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message,
      details: result.error.flatten(),
    });
  }
  return result.data;
}
