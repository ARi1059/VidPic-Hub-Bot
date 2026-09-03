import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const enabledByDefault = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  BOT_WORKER_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BOT_TOKEN: z.string().regex(/^\d{6,12}:[A-Za-z0-9_-]{20,}$/),
  TELEGRAM_STORAGE_CHAT_ID: z.string().regex(/^-?\d+$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
  SESSION_SECRET: z.string().min(32),
  MEDIA_SIGNING_SECRET: z.string().min(32),
  TELEGRAM_INIT_DATA_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  USER_SESSION_TTL_SECONDS: z.coerce.number().int().min(600).max(86_400).default(3600),
  ADMIN_SESSION_TTL_SECONDS: z.coerce.number().int().min(600).max(86_400).default(7200),
  REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(1_000),
  RATE_LIMIT_ENABLED: enabledByDefault,
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(120),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().int().min(1).max(1000).default(20),
  RATE_LIMIT_ADMIN_MAX_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(240),
  RATE_LIMIT_MEDIA_MAX_REQUESTS: z.coerce.number().int().min(1).max(10_000).default(180),
  MEDIA_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  MEDIA_MAX_BYTES: z.coerce.number().int().min(1_000_000).max(10_000_000).default(10_000_000),
  BOT_USERNAME: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
  MINI_APP_URL: z.string().url(),
  ADMIN_APP_URL: z.string().url(),
  PUBLIC_API_URL: z.string().url(),
  BOT_USE_WEBHOOK: booleanFromString,
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
): ServerEnvironment {
  const result = serverEnvironmentSchema
    .superRefine((value, context) => {
      if (value.NODE_ENV !== "production") return;
      for (const [name, url] of [
        ["MINI_APP_URL", value.MINI_APP_URL],
        ["ADMIN_APP_URL", value.ADMIN_APP_URL],
        ["PUBLIC_API_URL", value.PUBLIC_API_URL],
      ] as const) {
        if (!url.startsWith("https://")) {
          context.addIssue({ code: "custom", path: [name], message: "生产环境必须使用 HTTPS" });
        }
      }
      if (!value.BOT_USE_WEBHOOK) {
        context.addIssue({
          code: "custom",
          path: ["BOT_USE_WEBHOOK"],
          message: "生产环境必须启用 webhook",
        });
      }
    })
    .safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  return result.data;
}

export { serverEnvironmentSchema };
