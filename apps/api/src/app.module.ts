import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { parseServerEnvironment } from "@film-bot/config";
import { createDatabase } from "@film-bot/database";
import { Redis } from "ioredis";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AdminController } from "./admin/admin.controller.js";
import { AdminService } from "./admin/admin.service.js";
import { MeController } from "./auth/me.controller.js";
import { AdminSessionGuard, UserSessionGuard } from "./auth/session.guard.js";
import { ApiExceptionFilter } from "./api-exception.filter.js";
import { CatalogController } from "./catalog/catalog.controller.js";
import { CatalogService } from "./catalog/catalog.service.js";
import { ContentController } from "./content/content.controller.js";
import { ContentService } from "./content/content.service.js";
import { DeliveryController } from "./delivery/delivery.controller.js";
import { DeliveryService } from "./delivery/delivery.service.js";
import { HealthController } from "./health.controller.js";
import { InfrastructureLifecycle } from "./infrastructure-lifecycle.service.js";
import { MediaController } from "./media/media.controller.js";
import { MediaSigningService } from "./media/media-signing.service.js";
import { MembershipCtaService } from "./membership/membership-cta.service.js";
import { RequestIdInterceptor } from "./request-id.interceptor.js";
import { RateLimitGuard } from "./rate-limit.guard.js";
import { RateLimitService } from "./rate-limit.service.js";
import {
  DATABASE_CLOSE,
  DATABASE_CONNECTION,
  REDIS_CONNECTION,
  SERVER_ENVIRONMENT,
} from "./tokens.js";

const environment = parseServerEnvironment(process.env);
const databaseConnection = createDatabase(environment.DATABASE_URL);
const redisConnection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
  commandTimeout: environment.REDIS_COMMAND_TIMEOUT_MS,
});

@Module({
  controllers: [
    HealthController,
    AuthController,
    MeController,
    CatalogController,
    ContentController,
    DeliveryController,
    MediaController,
    AdminController,
  ],
  providers: [
    AuthService,
    AdminService,
    UserSessionGuard,
    AdminSessionGuard,
    CatalogService,
    ContentService,
    DeliveryService,
    MembershipCtaService,
    MediaSigningService,
    RateLimitService,
    RateLimitGuard,
    InfrastructureLifecycle,
    { provide: SERVER_ENVIRONMENT, useValue: environment },
    { provide: DATABASE_CONNECTION, useValue: databaseConnection.db },
    { provide: DATABASE_CLOSE, useValue: databaseConnection.close },
    { provide: REDIS_CONNECTION, useValue: redisConnection },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
