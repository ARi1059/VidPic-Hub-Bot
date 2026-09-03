import { parseServerEnvironment } from "@film-bot/config";
import type { Database } from "@film-bot/database";
import { createTelegramInitDataHash } from "@film-bot/telegram";
import { jwtVerify } from "jose";
import { describe, expect, it } from "vitest";

import { AuthService } from "./auth.service.js";

const botToken = "1234567890:abcdefghijklmnopqrstuvwxyz_ABC";
const sessionSecret = "0123456789abcdef0123456789abcdef";

function validInitData(): string {
  const parameters = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 12345, first_name: "Test", username: "test_user" }),
  });
  parameters.set("hash", createTelegramInitDataHash(parameters, botToken));
  return parameters.toString();
}

function databaseStub(): Database {
  return {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => [
            {
              id: "00000000-0000-4000-8000-000000000001",
              status: "active",
              displayName: "Test",
              memberActive: false,
            },
          ],
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "00000000-0000-4000-8000-000000000002", active: true }],
        }),
      }),
    }),
  } as unknown as Database;
}

describe("AuthService", () => {
  it("uses the configured lifetime for an administrator session", async () => {
    const environment = parseServerEnvironment({
      DATABASE_URL: "postgres://film_bot:film_bot@localhost:5432/film_bot",
      REDIS_URL: "redis://localhost:6379",
      BOT_TOKEN: botToken,
      TELEGRAM_STORAGE_CHAT_ID: "-1001234567890",
      TELEGRAM_WEBHOOK_SECRET: "0123456789abcdef",
      SESSION_SECRET: sessionSecret,
      MEDIA_SIGNING_SECRET: "abcdef0123456789abcdef0123456789",
      ADMIN_SESSION_TTL_SECONDS: "7200",
      BOT_USERNAME: "film_test_bot",
      MINI_APP_URL: "http://localhost:5173",
      ADMIN_APP_URL: "http://localhost:5174",
      PUBLIC_API_URL: "http://localhost:3000",
    });
    const service = new AuthService(environment, databaseStub());

    const result = await service.authenticate(validInitData(), "admin");
    const verified = await jwtVerify(result.accessToken, new TextEncoder().encode(sessionSecret), {
      issuer: "film-bot-api",
      audience: "admin",
    });

    expect((verified.payload.exp ?? 0) - (verified.payload.iat ?? 0)).toBe(7200);
    expect(result.user.admin).toBe(true);
  });

  it("uses the configured lifetime for a user session", async () => {
    const environment = parseServerEnvironment({
      DATABASE_URL: "postgres://film_bot:film_bot@localhost:5432/film_bot",
      REDIS_URL: "redis://localhost:6379",
      BOT_TOKEN: botToken,
      TELEGRAM_STORAGE_CHAT_ID: "-1001234567890",
      TELEGRAM_WEBHOOK_SECRET: "0123456789abcdef",
      SESSION_SECRET: sessionSecret,
      MEDIA_SIGNING_SECRET: "abcdef0123456789abcdef0123456789",
      USER_SESSION_TTL_SECONDS: "3600",
      BOT_USERNAME: "film_test_bot",
      MINI_APP_URL: "http://localhost:5173",
      ADMIN_APP_URL: "http://localhost:5174",
      PUBLIC_API_URL: "http://localhost:3000",
    });
    const service = new AuthService(environment, databaseStub());

    const result = await service.authenticate(validInitData(), "user");
    const verified = await jwtVerify(result.accessToken, new TextEncoder().encode(sessionSecret), {
      issuer: "film-bot-api",
      audience: "user",
    });

    expect((verified.payload.exp ?? 0) - (verified.payload.iat ?? 0)).toBe(3600);
  });
});
