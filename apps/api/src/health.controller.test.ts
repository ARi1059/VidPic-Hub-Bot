import { ServiceUnavailableException } from "@nestjs/common";
import type { Database } from "@film-bot/database";
import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller.js";

function database(execute: () => Promise<unknown>): Database {
  return { execute } as unknown as Database;
}

function redis(ping: () => Promise<unknown>): Redis {
  return { ping } as unknown as Redis;
}

describe("HealthController", () => {
  it("reports ready when PostgreSQL and Redis respond", async () => {
    const controller = new HealthController(
      database(async () => [{ result: 1 }]),
      redis(async () => "PONG"),
    );
    await expect(controller.ready()).resolves.toMatchObject({
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    });
  });

  it("returns service unavailable when a dependency fails", async () => {
    const controller = new HealthController(
      database(async () => {
        throw new Error("database down");
      }),
      redis(async () => "PONG"),
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
