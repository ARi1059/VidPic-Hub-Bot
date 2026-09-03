import { randomUUID } from "node:crypto";

import {
  Catch,
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === "object" && value !== null;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const response = http.getResponse<FastifyReply>();
    const headerRequestId = response.getHeader("x-request-id") ?? request.headers["x-request-id"];
    const requestId = typeof headerRequestId === "string" ? headerRequestId : randomUUID();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const rawPayload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = isErrorPayload(rawPayload) ? rawPayload : {};
    const defaultMessage = status >= 500 ? "服务暂时不可用" : "请求处理失败";

    if (status >= 500) {
      this.logger.error({
        requestId,
        method: request.method,
        path: request.url.split("?", 1)[0],
        status,
        error: exception instanceof Error ? exception.name : "UnknownError",
      });
    }

    response
      .status(status)
      .header("x-request-id", requestId)
      .send({
        code: typeof payload.code === "string" ? payload.code : fallbackCode(status),
        message: typeof payload.message === "string" ? payload.message : defaultMessage,
        requestId,
        ...(payload.details === undefined ? {} : { details: payload.details }),
      });
  }
}

function fallbackCode(status: number): string {
  if (status === HttpStatus.UNAUTHORIZED) return "AUTH_INVALID";
  if (status === HttpStatus.FORBIDDEN) return "FORBIDDEN";
  if (status === HttpStatus.NOT_FOUND) return "NOT_FOUND";
  if (status === HttpStatus.BAD_REQUEST) return "VALIDATION_FAILED";
  if (status === HttpStatus.CONFLICT) return "CONFLICT";
  if (status === HttpStatus.TOO_MANY_REQUESTS) return "RATE_LIMITED";
  return "INTERNAL_ERROR";
}
