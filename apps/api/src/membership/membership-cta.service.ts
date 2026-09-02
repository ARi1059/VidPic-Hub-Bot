import { createHash, randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ServerEnvironment } from "@film-bot/config";
import type { Database } from "@film-bot/database";
import { membershipCtaTokens } from "@film-bot/database";

import { DATABASE_CONNECTION, SERVER_ENVIRONMENT } from "../tokens.js";

@Injectable()
export class MembershipCtaService {
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly database: Database,
    @Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment,
  ) {}

  public async create(input: {
    userId: string;
    workId: string | null;
    sourcePlacement: string;
    recommendationRequestId?: string;
    label: string;
  }) {
    const token = randomBytes(24).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.database.insert(membershipCtaTokens).values({
      tokenHash,
      userId: input.userId,
      workId: input.workId,
      sourcePlacement: input.sourcePlacement,
      recommendationRequestId: input.recommendationRequestId,
      expiresAt,
    });
    return {
      label: input.label,
      url: `https://t.me/${this.environment.BOT_USERNAME}?start=member_${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
