import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "./index.js";

const validEnvironment = {
  DATABASE_URL: "postgres://film_bot:film_bot@localhost:5432/film_bot",
  REDIS_URL: "redis://localhost:6379",
  BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz_ABC",
  TELEGRAM_STORAGE_CHAT_ID: "-1001234567890",
  TELEGRAM_WEBHOOK_SECRET: "0123456789abcdef",
  SESSION_SECRET: "0123456789abcdef0123456789abcdef",
  MEDIA_SIGNING_SECRET: "abcdef0123456789abcdef0123456789",
  BOT_USERNAME: "film_test_bot",
  MINI_APP_URL: "http://localhost:5173",
  ADMIN_APP_URL: "http://localhost:5174",
  PUBLIC_API_URL: "http://localhost:3000",
};

describe("parseServerEnvironment", () => {
  it("applies development defaults without weakening secret validation", () => {
    const configuration = parseServerEnvironment(validEnvironment);

    expect(configuration.NODE_ENV).toBe("development");
    expect(configuration.API_PORT).toBe(3000);
    expect(configuration.BOT_USE_WEBHOOK).toBe(false);
    expect(configuration.USER_SESSION_TTL_SECONDS).toBe(3600);
    expect(configuration.ADMIN_SESSION_TTL_SECONDS).toBe(7200);
  });

  it("rejects short secrets", () => {
    expect(() => parseServerEnvironment({ ...validEnvironment, SESSION_SECRET: "short" })).toThrow(
      "Invalid server environment",
    );
  });

  it("requires HTTPS and webhook transport in production", () => {
    expect(() => parseServerEnvironment({ ...validEnvironment, NODE_ENV: "production" })).toThrow(
      "生产环境必须使用 HTTPS",
    );

    const configuration = parseServerEnvironment({
      ...validEnvironment,
      NODE_ENV: "production",
      MINI_APP_URL: "https://mini.example.com",
      ADMIN_APP_URL: "https://admin.example.com",
      PUBLIC_API_URL: "https://api.example.com",
      BOT_USE_WEBHOOK: "true",
    });
    expect(configuration.BOT_USE_WEBHOOK).toBe(true);
    expect(configuration.MEDIA_MAX_BYTES).toBe(10_000_000);
  });
});
