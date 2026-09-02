import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.number().int().positive(),
  is_bot: z.boolean().optional(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  photo_url: z.string().url().optional(),
});

export type TelegramWebAppUser = z.infer<typeof telegramUserSchema>;

export interface TelegramInitData {
  authDate: Date;
  queryId: string | null;
  startParam: string | null;
  user: TelegramWebAppUser;
  raw: URLSearchParams;
}

export interface InitDataVerificationOptions {
  maxAgeSeconds: number;
  now?: Date;
  futureToleranceSeconds?: number;
}

export class TelegramInitDataError extends Error {
  public constructor(
    message: string,
    public readonly code: "MALFORMED" | "INVALID_SIGNATURE" | "EXPIRED",
  ) {
    super(message);
    this.name = "TelegramInitDataError";
  }
}

function signatureFor(parameters: URLSearchParams, botToken: string): Buffer {
  const dataCheckString = [...parameters.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest();
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  options: InitDataVerificationOptions,
): TelegramInitData {
  const parameters = new URLSearchParams(initData);
  const providedHash = parameters.get("hash");
  const authDateValue = parameters.get("auth_date");
  const userValue = parameters.get("user");

  if (!providedHash || !/^[a-f\d]{64}$/i.test(providedHash) || !authDateValue || !userValue) {
    throw new TelegramInitDataError("Telegram initData is malformed", "MALFORMED");
  }

  const expectedHash = signatureFor(parameters, botToken);
  const receivedHash = Buffer.from(providedHash, "hex");
  if (receivedHash.length !== expectedHash.length || !timingSafeEqual(receivedHash, expectedHash)) {
    throw new TelegramInitDataError("Telegram initData signature is invalid", "INVALID_SIGNATURE");
  }

  const authDateSeconds = Number(authDateValue);
  if (!Number.isSafeInteger(authDateSeconds) || authDateSeconds <= 0) {
    throw new TelegramInitDataError("Telegram initData auth_date is invalid", "MALFORMED");
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const futureTolerance = options.futureToleranceSeconds ?? 30;
  if (
    nowSeconds - authDateSeconds > options.maxAgeSeconds ||
    authDateSeconds - nowSeconds > futureTolerance
  ) {
    throw new TelegramInitDataError("Telegram initData has expired", "EXPIRED");
  }

  let userJson: unknown;
  try {
    userJson = JSON.parse(userValue);
  } catch {
    throw new TelegramInitDataError("Telegram initData user is malformed", "MALFORMED");
  }
  const userResult = telegramUserSchema.safeParse(userJson);
  if (!userResult.success) {
    throw new TelegramInitDataError("Telegram initData user is invalid", "MALFORMED");
  }

  return {
    authDate: new Date(authDateSeconds * 1000),
    queryId: parameters.get("query_id"),
    startParam: parameters.get("start_param"),
    user: userResult.data,
    raw: parameters,
  };
}

export function createTelegramInitDataHash(parameters: URLSearchParams, botToken: string): string {
  return signatureFor(parameters, botToken).toString("hex");
}
