import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { workTypeSchema } from "@film-bot/contracts";
import type { FastifyRequest } from "fastify";

import { CatalogService } from "./catalog.service.js";
import { getRequestSession } from "../auth/session.js";
import { UserSessionGuard } from "../auth/session.guard.js";

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().nullable().optional(),
  type: workTypeSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

@Controller("works")
@UseGuards(UserSessionGuard)
export class CatalogController {
  public constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get()
  public list(@Req() request: FastifyRequest, @Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "列表参数无效" });
    }
    const session = getRequestSession(request);
    return this.catalog.listWorks({
      userId: session.userId,
      memberActive: session.memberActive,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor ?? null,
      type: parsed.data.type ?? null,
      query: parsed.data.q ?? null,
    });
  }

  @Get("search")
  public search(@Req() request: FastifyRequest, @Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success || !parsed.data.q) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "搜索关键词无效" });
    }
    const session = getRequestSession(request);
    return this.catalog.listWorks({
      userId: session.userId,
      memberActive: session.memberActive,
      limit: parsed.data.limit,
      cursor: parsed.data.cursor ?? null,
      type: parsed.data.type ?? null,
      query: parsed.data.q,
      sourcePlacement: "search",
    });
  }

  @Get(":workId")
  public detail(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    const parsedId = z.string().uuid().safeParse(workId);
    if (!parsedId.success) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "作品 ID 无效" });
    }
    const session = getRequestSession(request);
    return this.catalog.getWork({
      userId: session.userId,
      memberActive: session.memberActive,
      workId: parsedId.data,
    });
  }
}
