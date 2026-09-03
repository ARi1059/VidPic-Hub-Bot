import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { parseServerEnvironment } from "@film-bot/config";

import { AppModule } from "./app.module.js";

const environment = parseServerEnvironment(process.env);
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ bodyLimit: 1_048_576, trustProxy: 1 }),
  {
    ...(environment.NODE_ENV === "production" ? { logger: ["error", "warn", "log"] } : {}),
  },
);

app.enableCors({
  origin: [new URL(environment.MINI_APP_URL).origin, new URL(environment.ADMIN_APP_URL).origin],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "X-Request-ID"],
  maxAge: 600,
});
app.setGlobalPrefix("api");
app.enableShutdownHooks();

if (environment.NODE_ENV !== "production") {
  const openApiConfiguration = new DocumentBuilder()
    .setTitle("Telegram 影视 Bot API")
    .setDescription("Mini App、管理端与 Bot Worker 接口")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openApiConfiguration));
}

await app.listen(environment.API_PORT, "0.0.0.0");
