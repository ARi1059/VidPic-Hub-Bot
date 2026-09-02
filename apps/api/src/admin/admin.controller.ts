import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  createMediaAssetRequestSchema,
  createSectionRequestSchema,
  createUnitRequestSchema,
  createWorkRequestSchema,
  ingestionAttachRequestSchema,
  membershipSettingRequestSchema,
  updateMediaAssetRequestSchema,
  updateSectionRequestSchema,
  updateUnitRequestSchema,
  updateUserMembershipRequestSchema,
  updateWorkRequestSchema,
} from "@film-bot/contracts";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AdminService } from "./admin.service.js";
import { getRequestSession } from "../auth/session.js";
import { AdminSessionGuard } from "../auth/session.guard.js";

const idSchema = z.string().uuid();
const workListQuerySchema = z.object({
  status: z.enum(["draft", "published", "withdrawn"]).optional(),
});

@Controller("admin")
@UseGuards(AdminSessionGuard)
export class AdminController {
  public constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("works")
  public listWorks(@Req() request: FastifyRequest, @Query() query: unknown) {
    requirePermission(request, "content.read");
    const parsed = parse(workListQuerySchema, query);
    return this.admin.listWorks(parsed.status);
  }

  @Post("works")
  public createWork(@Req() request: FastifyRequest, @Body() body: unknown) {
    requirePermission(request, "content.write");
    return this.admin.createWork(parse(createWorkRequestSchema, body), auditContext(request));
  }

  @Get("works/:workId")
  public workBundle(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    requirePermission(request, "content.read");
    return this.admin.getWorkBundle(parse(idSchema, workId));
  }

  @Patch("works/:workId")
  public updateWork(
    @Req() request: FastifyRequest,
    @Param("workId") workId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "content.write");
    return this.admin.updateWork(
      parse(idSchema, workId),
      parse(updateWorkRequestSchema, body),
      auditContext(request),
    );
  }

  @Post("works/:workId/publish")
  public publishWork(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    requirePermission(request, "content.publish");
    return this.admin.publishWork(parse(idSchema, workId), auditContext(request));
  }

  @Post("works/:workId/withdraw")
  public withdrawWork(@Req() request: FastifyRequest, @Param("workId") workId: string) {
    requirePermission(request, "content.publish");
    return this.admin.withdrawWork(parse(idSchema, workId), auditContext(request));
  }

  @Post("works/:workId/sections")
  public createSection(
    @Req() request: FastifyRequest,
    @Param("workId") workId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "content.write");
    return this.admin.createSection(
      parse(idSchema, workId),
      parse(createSectionRequestSchema, body),
      auditContext(request),
    );
  }

  @Patch("sections/:sectionId")
  public updateSection(
    @Req() request: FastifyRequest,
    @Param("sectionId") sectionId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "content.write");
    return this.admin.updateSection(
      parse(idSchema, sectionId),
      parse(updateSectionRequestSchema, body),
      auditContext(request),
    );
  }

  @Post("sections/:sectionId/units")
  public createUnit(
    @Req() request: FastifyRequest,
    @Param("sectionId") sectionId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "content.write");
    return this.admin.createUnit(
      parse(idSchema, sectionId),
      parse(createUnitRequestSchema, body),
      auditContext(request),
    );
  }

  @Patch("units/:unitId")
  public updateUnit(
    @Req() request: FastifyRequest,
    @Param("unitId") unitId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "content.write");
    return this.admin.updateUnit(
      parse(idSchema, unitId),
      parse(updateUnitRequestSchema, body),
      auditContext(request),
    );
  }

  @Post("media-assets")
  public createMedia(@Req() request: FastifyRequest, @Body() body: unknown) {
    requirePermission(request, "content.write");
    const parsed = parse(createMediaAssetRequestSchema, body);
    return this.admin.createMedia(
      {
        ...parsed,
        storageChatId: BigInt(parsed.storageChatId),
        pixelCount: parsed.width && parsed.height ? parsed.width * parsed.height : null,
      },
      auditContext(request),
    );
  }

  @Patch("media-assets/:mediaId")
  public updateMedia(
    @Req() request: FastifyRequest,
    @Param("mediaId") mediaId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "content.write");
    const parsed = parse(updateMediaAssetRequestSchema, body);
    const { storageChatId, ...fields } = parsed;
    return this.admin.updateMedia(
      parse(idSchema, mediaId),
      {
        ...fields,
        ...(storageChatId ? { storageChatId: BigInt(storageChatId) } : {}),
      },
      auditContext(request),
    );
  }

  @Get("settings")
  public settings(@Req() request: FastifyRequest) {
    requirePermission(request, "settings.read");
    return this.admin.getSettings();
  }

  @Patch("settings/membership")
  public membershipSetting(@Req() request: FastifyRequest, @Body() body: unknown) {
    requirePermission(request, "settings.write");
    const parsed = parse(membershipSettingRequestSchema, body);
    return this.admin.setMembershipEnabled(parsed.membershipEnabled, auditContext(request));
  }

  @Get("users")
  public users(@Req() request: FastifyRequest) {
    requirePermission(request, "users.read");
    return this.admin.listUsers();
  }

  @Patch("users/:userId/membership")
  public userMembership(
    @Req() request: FastifyRequest,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "users.membership");
    return this.admin.updateMembership(
      parse(idSchema, userId),
      parse(updateUserMembershipRequestSchema, body),
      auditContext(request),
    );
  }

  @Get("ingestion")
  public ingestion(@Req() request: FastifyRequest) {
    requirePermission(request, "ingestion.read");
    return this.admin.listIngestionItems();
  }

  @Post("ingestion/:ingestionId/attach")
  public attachIngestion(
    @Req() request: FastifyRequest,
    @Param("ingestionId") ingestionId: string,
    @Body() body: unknown,
  ) {
    requirePermission(request, "ingestion.manage");
    return this.admin.attachIngestion(
      parse(idSchema, ingestionId),
      parse(ingestionAttachRequestSchema, body),
      auditContext(request),
    );
  }

  @Get("audit-logs")
  public auditLogs(@Req() request: FastifyRequest) {
    requirePermission(request, "audit.read");
    return this.admin.listAuditLogs();
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "请求参数无效",
      details: result.error.flatten(),
    });
  }
  return result.data;
}

function requirePermission(request: FastifyRequest, permission: string): void {
  const permissions = getRequestSession(request).permissions;
  if (!permissions.includes("*") && !permissions.includes(permission)) {
    throw new ForbiddenException({ code: "FORBIDDEN", message: "管理员权限不足" });
  }
}

function auditContext(request: FastifyRequest) {
  const session = getRequestSession(request);
  if (!session.adminId)
    throw new ForbiddenException({ code: "FORBIDDEN", message: "管理员会话无效" });
  return {
    adminId: session.adminId,
    requestId: request.id,
    ipAddress: request.ip ?? null,
  };
}
