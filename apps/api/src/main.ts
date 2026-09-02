import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { parseServerEnvironment } from "@film-bot/config";

import { AppModule } from "./app.module.js";

const environment = parseServerEnvironment(process.env);
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
  ...(environment.NODE_ENV === "production" ? { logger: ["error", "warn", "log"] } : {}),
});

app.enableCors({
  origin: [environment.MINI_APP_URL, environment.ADMIN_APP_URL],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});
app.setGlobalPrefix("api");

const openApiConfiguration = new DocumentBuilder()
  .setTitle("Telegram 影视 Bot API")
  .setDescription("Mini App、管理端与 Bot Worker 的 MVP 接口")
  .setVersion("0.1.0")
  .addBearerAuth()
  .build();
SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openApiConfiguration));

await app.listen(environment.API_PORT, "0.0.0.0");
