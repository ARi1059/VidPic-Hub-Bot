import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ServerEnvironment } from "@film-bot/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Redis } from "ioredis";

import { REDIS_CONNECTION, SERVER_ENVIRONMENT } from "./tokens.js";

interface RateLimitPolicy {
  bucket: string;
  limit: number;
  failClosed: boolean;
}

@Injectable()
export class RateLimitService {
  public constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    @Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment,
  ) {}

  public async enforce(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!this.environment.RATE_LIMIT_ENABLED || isHealthPath(request.url)) return;

    const policy = policyFor(request.url, this.environment);
    const identity = request.ip || "unknown";
    const window = this.environment.RATE_LIMIT_WINDOW_SECONDS;
    const bucket = Math.floor(Date.now() / 1000 / window);
    const key = `film-bot:rate-limit:${bucket}:${policy.bucket}:${identity}`;

    let count: number;
    try {
      const result = await withTimeout(
        this.redis.multi().incr(key).expire(key, window).exec(),
        this.environment.REDIS_COMMAND_TIMEOUT_MS,
      );
      count = Number(result?.[0]?.[1] ?? 0);
    } catch {
      if (policy.failClosed) {
        throw new HttpException(
          { code: "SERVICE_NOT_READY", message: "请求保护服务暂时不可用" },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      // Public read traffic remains available during brief Redis outages; readiness still reports red.
      return;
    }

    const remaining = Math.max(0, policy.limit - count);
    const reset = (bucket + 1) * window;
    reply.header("ratelimit-limit", policy.limit);
    reply.header("ratelimit-remaining", remaining);
    reply.header("ratelimit-reset", reset);
    if (count <= policy.limit) return;

    const retryAfterSeconds = Math.max(1, reset - Math.floor(Date.now() / 1000));
    reply.header("retry-after", retryAfterSeconds);
    throw new HttpException(
      {
        code: "RATE_LIMITED",
        message: "请求过于频繁，请稍后再试",
        details: { retryAfterSeconds },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export function policyFor(url: string, environment: ServerEnvironment): RateLimitPolicy {
  const path = url.split("?", 1)[0] ?? url;
  if (path.startsWith("/api/auth/")) {
    return {
      bucket: "auth",
      limit: environment.RATE_LIMIT_AUTH_MAX_REQUESTS,
      failClosed: true,
    };
  }
  if (path.startsWith("/api/admin/")) {
    return {
      bucket: "admin",
      limit: environment.RATE_LIMIT_ADMIN_MAX_REQUESTS,
      failClosed: true,
    };
  }
  if (path.startsWith("/api/media/")) {
    return {
      bucket: "media",
      limit: environment.RATE_LIMIT_MEDIA_MAX_REQUESTS,
      failClosed: false,
    };
  }
  return { bucket: "api", limit: environment.RATE_LIMIT_MAX_REQUESTS, failClosed: false };
}

function isHealthPath(url: string): boolean {
  const path = url.split("?", 1)[0] ?? url;
  return path === "/api/health" || path === "/api/health/ready";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("rate limit dependency timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
