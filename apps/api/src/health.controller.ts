import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Database } from "@film-bot/database";
import { sql } from "drizzle-orm";
import type { Redis } from "ioredis";

import { DATABASE_CONNECTION, REDIS_CONNECTION } from "./tokens.js";

@ApiTags("system")
@Controller("health")
export class HealthController {
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: "服务存活检查" })
  public health() {
    return {
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  @ApiOperation({ summary: "服务依赖就绪检查" })
  public async ready() {
    const [database, redis] = await Promise.all([
      dependencyCheck(() => this.database.execute(sql`select 1`)),
      dependencyCheck(() => this.redis.ping()),
    ]);
    const checks = { database, redis };
    if (database !== "ok" || redis !== "ok") {
      throw new ServiceUnavailableException({
        code: "SERVICE_NOT_READY",
        message: "服务依赖尚未就绪",
        details: { checks },
      });
    }
    return { status: "ok", service: "api", checks, timestamp: new Date().toISOString() };
  }
}

async function dependencyCheck(check: () => Promise<unknown>): Promise<"ok" | "failed"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      check(),
      new Promise<never>(
        (_, reject) => (timer = setTimeout(() => reject(new Error("dependency timeout")), 1500)),
      ),
    ]);
    return "ok";
  } catch {
    return "failed";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
