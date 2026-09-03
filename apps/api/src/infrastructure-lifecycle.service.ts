import { Inject, Injectable } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import type { Redis } from "ioredis";

import { DATABASE_CLOSE, REDIS_CONNECTION } from "./tokens.js";

@Injectable()
export class InfrastructureLifecycle implements OnApplicationShutdown {
  public constructor(
    @Inject(DATABASE_CLOSE) private readonly closeDatabase: () => Promise<void>,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.closeDatabase(), this.redis.quit()]);
  }
}
