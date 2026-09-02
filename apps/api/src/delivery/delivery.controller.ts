import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { videoDeliveryRequestSchema } from "@film-bot/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { DeliveryService } from "./delivery.service.js";
import { getRequestSession } from "../auth/session.js";
import { UserSessionGuard } from "../auth/session.guard.js";

const uuidSchema = z.string().uuid();

@Controller("deliveries")
@UseGuards(UserSessionGuard)
export class DeliveryController {
  public constructor(@Inject(DeliveryService) private readonly deliveries: DeliveryService) {}

  @Post("video")
  public createVideo(@Req() request: FastifyRequest, @Body() body: unknown) {
    const result = videoDeliveryRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "视频发送请求无效",
        details: result.error.flatten(),
      });
    }
    return this.deliveries.createVideo({
      userId: getRequestSession(request).userId,
      ...result.data,
    });
  }

  @Get("recent")
  public recent(@Req() request: FastifyRequest) {
    return this.deliveries.listRecent(getRequestSession(request).userId);
  }

  @Get(":deliveryId")
  public get(@Req() request: FastifyRequest, @Param("deliveryId") deliveryId: string) {
    const result = uuidSchema.safeParse(deliveryId);
    if (!result.success) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "发送任务 ID 无效" });
    }
    return this.deliveries.get(getRequestSession(request).userId, result.data);
  }
}
