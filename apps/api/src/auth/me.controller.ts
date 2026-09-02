import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { getRequestSession } from "./session.js";
import { UserSessionGuard } from "./session.guard.js";

@Controller("me")
@UseGuards(UserSessionGuard)
export class MeController {
  @Get()
  public me(@Req() request: FastifyRequest) {
    const session = getRequestSession(request);
    return {
      id: session.userId,
      telegramUserId: session.telegramUserId,
      displayName: session.displayName,
      memberActive: session.memberActive,
      memberExpiresAt: session.memberExpiresAt?.toISOString() ?? null,
    };
  }
}
