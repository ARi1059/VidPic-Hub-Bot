import type { ServerEnvironment } from "@film-bot/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";

import { RateLimitService, policyFor } from "./rate-limit.service.js";

function environment(overrides: Partial<ServerEnvironment> = {}): ServerEnvironment {
  return {
    NODE_ENV: "test",
    API_PORT: 3000,
    BOT_WORKER_PORT: 3001,
    DATABASE_URL: "postgres://film_bot:film_bot@localhost:5432/film_bot",
    REDIS_URL: "redis://localhost:6379",
    BOT_TOKEN: "1234567890:abcdefghijklmnopqrstuvwxyz_ABC",
    TELEGRAM_STORAGE_CHAT_ID: "-1001234567890",
    TELEGRAM_WEBHOOK_SECRET: "0123456789abcdef",
    SESSION_SECRET: "0123456789abcdef0123456789abcdef",
    MEDIA_SIGNING_SECRET: "abcdef0123456789abcdef0123456789",
    TELEGRAM_INIT_DATA_TTL_SECONDS: 900,
    USER_SESSION_TTL_SECONDS: 3600,
    ADMIN_SESSION_TTL_SECONDS: 7200,
    REDIS_COMMAND_TIMEOUT_MS: 1000,
    RATE_LIMIT_ENABLED: true,
    RATE_LIMIT_WINDOW_SECONDS: 60,
    RATE_LIMIT_MAX_REQUESTS: 2,
    RATE_LIMIT_AUTH_MAX_REQUESTS: 1,
    RATE_LIMIT_ADMIN_MAX_REQUESTS: 3,
    RATE_LIMIT_MEDIA_MAX_REQUESTS: 4,
    MEDIA_UPSTREAM_TIMEOUT_MS: 15000,
    MEDIA_MAX_BYTES: 10_000_000,
    BOT_USERNAME: "film_test_bot",
    MINI_APP_URL: "http://localhost:5173",
    ADMIN_APP_URL: "http://localhost:5174",
    PUBLIC_API_URL: "http://localhost:3000",
    BOT_USE_WEBHOOK: false,
    ...overrides,
  };
}

function redisWithCount(count: number): Redis {
  const chain = {
    incr: vi.fn(() => chain),
    expire: vi.fn(() => chain),
    exec: vi.fn(async () => [
      [null, count],
      [null, 1],
    ]),
  };
  return { multi: vi.fn(() => chain) } as unknown as Redis;
}

function request(url: string): FastifyRequest {
  return { url, ip: "127.0.0.1" } as FastifyRequest;
}

function reply(): FastifyReply & { header: ReturnType<typeof vi.fn> } {
  return { header: vi.fn() } as unknown as FastifyReply & { header: ReturnType<typeof vi.fn> };
}

describe("RateLimitService", () => {
  it("selects stricter policies for auth and media routes", () => {
    expect(policyFor("/api/auth/telegram", environment()).limit).toBe(1);
    expect(policyFor("/api/media/images/asset", environment()).limit).toBe(4);
    expect(policyFor("/api/admin/works", environment()).limit).toBe(3);
  });

  it("emits rate headers and rejects requests beyond the window", async () => {
    const service = new RateLimitService(redisWithCount(3), environment());
    const response = reply();

    await expect(service.enforce(request("/api/works"), response)).rejects.toMatchObject({
      status: 429,
    });
    expect(response.header).toHaveBeenCalledWith("ratelimit-limit", 2);
    expect(response.header).toHaveBeenCalledWith("ratelimit-remaining", 0);
    expect(response.header).toHaveBeenCalledWith("retry-after", expect.any(Number));
  });

  it("fails open when Redis is unavailable", async () => {
    const service = new RateLimitService(
      {
        multi: () => ({
          incr: () => ({
            expire: () => ({
              exec: async () => {
                throw new Error("redis down");
              },
            }),
          }),
        }),
      } as unknown as Redis,
      environment(),
    );
    await expect(service.enforce(request("/api/works"), reply())).resolves.toBeUndefined();
  });

  it("fails closed for authentication when Redis is unavailable", async () => {
    const unavailable = {
      multi: () => ({
        incr: () => ({
          expire: () => ({
            exec: async () => {
              throw new Error("redis down");
            },
          }),
        }),
      }),
    } as unknown as Redis;
    const service = new RateLimitService(unavailable, environment());
    await expect(service.enforce(request("/api/auth/telegram"), reply())).rejects.toMatchObject({
      status: 503,
    });
  });
});
