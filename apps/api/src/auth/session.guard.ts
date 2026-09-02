import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { ServerEnvironment } from "@film-bot/config";
import type { Database } from "@film-bot/database";
import { adminAccounts, adminRoles, users } from "@film-bot/database";
import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { jwtVerify } from "jose";

import type { AuthenticatedRequest, RequestSession } from "./session.js";
import { DATABASE_CONNECTION, SERVER_ENVIRONMENT } from "../tokens.js";

interface SessionTokenPayload {
  sub: string;
  telegramUserId: string;
}

async function verifyToken(
  request: FastifyRequest,
  environment: ServerEnvironment,
  audience: "user" | "admin",
): Promise<SessionTokenPayload> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    throw new UnauthorizedException({ code: "AUTH_INVALID", message: "缺少业务会话" });
  }
  try {
    const result = await jwtVerify(
      authorization.slice("Bearer ".length),
      new TextEncoder().encode(environment.SESSION_SECRET),
      { issuer: "film-bot-api", audience },
    );
    if (
      typeof result.payload.sub !== "string" ||
      typeof result.payload.telegramUserId !== "string"
    ) {
      throw new Error("Session claims are incomplete");
    }
    return { sub: result.payload.sub, telegramUserId: result.payload.telegramUserId };
  } catch {
    throw new UnauthorizedException({ code: "AUTH_INVALID", message: "业务会话无效或已过期" });
  }
}

async function resolveSession(
  database: Database,
  token: SessionTokenPayload,
  audience: "user" | "admin",
): Promise<RequestSession> {
  const [user] = await database
    .select()
    .from(users)
    .where(and(eq(users.id, token.sub), eq(users.telegramUserId, BigInt(token.telegramUserId))))
    .limit(1);
  if (!user || user.status !== "active") {
    throw new ForbiddenException({ code: "FORBIDDEN", message: "账号当前不可用" });
  }

  const membershipValid =
    user.memberActive && (!user.memberExpiresAt || user.memberExpiresAt.getTime() > Date.now());
  if (audience === "user") {
    return {
      userId: user.id,
      telegramUserId: user.telegramUserId.toString(),
      displayName: user.displayName,
      memberActive: membershipValid,
      memberExpiresAt: user.memberExpiresAt,
      adminId: null,
      permissions: [],
      audience,
    };
  }

  const [administrator] = await database
    .select({
      id: adminAccounts.id,
      active: adminAccounts.active,
      permissions: adminRoles.permissions,
    })
    .from(adminAccounts)
    .innerJoin(adminRoles, eq(adminRoles.id, adminAccounts.roleId))
    .where(eq(adminAccounts.telegramUserId, user.telegramUserId))
    .limit(1);
  if (!administrator?.active) {
    throw new ForbiddenException({ code: "FORBIDDEN", message: "管理员账号不可用" });
  }
  return {
    userId: user.id,
    telegramUserId: user.telegramUserId.toString(),
    displayName: user.displayName,
    memberActive: membershipValid,
    memberExpiresAt: user.memberExpiresAt,
    adminId: administrator.id,
    permissions: administrator.permissions,
    audience,
  };
}

@Injectable()
export class UserSessionGuard implements CanActivate {
  public constructor(
    @Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment,
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = await verifyToken(request, this.environment, "user");
    request.session = await resolveSession(this.database, token, "user");
    return true;
  }
}

@Injectable()
export class AdminSessionGuard implements CanActivate {
  public constructor(
    @Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment,
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = await verifyToken(request, this.environment, "admin");
    request.session = await resolveSession(this.database, token, "admin");
    return true;
  }
}
