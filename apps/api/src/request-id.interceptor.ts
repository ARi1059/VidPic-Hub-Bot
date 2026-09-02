import { randomUUID } from "node:crypto";

import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { map, type Observable } from "rxjs";

interface ApiResponse<T> {
  data: T;
  requestId: string;
}

@Injectable()
export class RequestIdInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  public intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const response = context.switchToHttp().getResponse<FastifyReply>();
    const existingRequestId = request.headers["x-request-id"];
    const requestId = typeof existingRequestId === "string" ? existingRequestId : randomUUID();
    response.header("x-request-id", requestId);

    return next.handle().pipe(map((data) => ({ data, requestId })));
  }
}
