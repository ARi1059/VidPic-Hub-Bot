import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { RateLimitService } from "./rate-limit.service.js";

@Injectable()
export class RateLimitGuard implements CanActivate {
  public constructor(@Inject(RateLimitService) private readonly rateLimit: RateLimitService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    await this.rateLimit.enforce(request, reply);
    return true;
  }
}
