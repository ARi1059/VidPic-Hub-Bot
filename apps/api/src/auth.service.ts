import { Inject, Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { ServerEnvironment } from "@film-bot/config";
import type { Database } from "@film-bot/database";
import { adminAccounts, users } from "@film-bot/database";
import { verifyTelegramInitData } from "@film-bot/telegram";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";

import { DATABASE_CONNECTION, SERVER_ENVIRONMENT } from "./tokens.js";

export type SessionAudience = "user" | "admin";

@Injectable()
export class AuthService {
  public constructor(
    @Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment,
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
  ) {}

  public async authenticate(initData: string, audience: SessionAudience) {
    let telegram;
    try {
      telegram = verifyTelegramInitData(initData, this.environment.BOT_TOKEN, {
        maxAgeSeconds: this.environment.TELEGRAM_INIT_DATA_TTL_SECONDS,
      });
    } catch {
      throw new UnauthorizedException({ code: "AUTH_INVALID", message: "Telegram 身份验证失败" });
    }

    const telegramUserId = BigInt(telegram.user.id);
    const [user] = await this.database
      .insert(users)
      .values({
        telegramUserId,
        username: telegram.user.username,
        displayName: [telegram.user.first_name, telegram.user.last_name].filter(Boolean).join(" "),
        languageCode: telegram.user.language_code,
        photoUrl: telegram.user.photo_url,
        lastActiveAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.telegramUserId,
        set: {
          username: telegram.user.username,
          displayName: [telegram.user.first_name, telegram.user.last_name]
            .filter(Boolean)
            .join(" "),
          languageCode: telegram.user.language_code,
          photoUrl: telegram.user.photo_url,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!user || user.status !== "active") {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "账号当前不可用" });
    }

    const [administrator] = await this.database
      .select({ id: adminAccounts.id, active: adminAccounts.active })
      .from(adminAccounts)
      .where(eq(adminAccounts.telegramUserId, telegramUserId))
      .limit(1);
    const isAdministrator = administrator?.active === true;
    if (audience === "admin" && !isAdministrator) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "不在管理员白名单中" });
    }

    const lifetimeSeconds = audience === "admin" ? this.environment.ADMIN_SESSION_TTL_SECONDS : 900;
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000);
    const accessToken = await new SignJWT({
      telegramUserId: telegramUserId.toString(),
      memberActive: user.memberActive,
      admin: isAdministrator,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("film-bot-api")
      .setSubject(user.id)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(new TextEncoder().encode(this.environment.SESSION_SECRET));

    return {
      accessToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        telegramUserId: telegramUserId.toString(),
        displayName: user.displayName,
        memberActive: user.memberActive,
        admin: isAdministrator,
      },
    };
  }
}
