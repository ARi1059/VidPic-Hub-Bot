import { describe, expect, it } from "vitest";

import { createTelegramInitDataHash, verifyTelegramInitData } from "./init-data.js";

const botToken = "1234567890:abcdefghijklmnopqrstuvwxyz_ABC";
const now = new Date("2026-09-02T00:00:00.000Z");

function validInitData(authDate = Math.floor(now.getTime() / 1000)): string {
  const parameters = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({ id: 12345, first_name: "Test", username: "test_user" }),
  });
  parameters.set("hash", createTelegramInitDataHash(parameters, botToken));
  return parameters.toString();
}

describe("verifyTelegramInitData", () => {
  it("verifies a current signed payload", () => {
    const result = verifyTelegramInitData(validInitData(), botToken, {
      maxAgeSeconds: 900,
      now,
    });

    expect(result.user.id).toBe(12345);
    expect(result.queryId).toBe("AAHdF6IQAAAAAN0XohDhrOrc");
  });

  it("rejects payload tampering", () => {
    const tampered = validInitData().replace("test_user", "other_user");
    expect(() => verifyTelegramInitData(tampered, botToken, { maxAgeSeconds: 900, now })).toThrow(
      "signature is invalid",
    );
  });

  it("rejects expired payloads", () => {
    const oldAuthDate = Math.floor(now.getTime() / 1000) - 901;
    expect(() =>
      verifyTelegramInitData(validInitData(oldAuthDate), botToken, { maxAgeSeconds: 900, now }),
    ).toThrow("has expired");
  });
});
