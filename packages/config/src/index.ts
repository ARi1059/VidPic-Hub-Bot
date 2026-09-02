import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
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
  ADMIN_SESSION_TTL_SECONDS: z.coerce.number().int().min(600).max(86_400).default(7200),
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
  const result = serverEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid server environment: ${issues}`);
  }
  return result.data;
}

export { serverEnvironmentSchema };
