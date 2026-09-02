import { createHmac, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { ServerEnvironment } from "@film-bot/config";

import { SERVER_ENVIRONMENT } from "../tokens.js";

@Injectable()
export class MediaSigningService {
  public constructor(@Inject(SERVER_ENVIRONMENT) private readonly environment: ServerEnvironment) {}

  public createPublicCoverUrl(assetId: string): string {
    const expires = Math.floor(Date.now() / 1000) + 10 * 60;
    const signature = this.sign(assetId, expires);
    return `${this.environment.PUBLIC_API_URL}/api/media/thumbnails/${assetId}?expires=${expires}&signature=${signature}`;
  }

  public createProtectedImageUrl(assetId: string, userId: string): string {
    const expires = Math.floor(Date.now() / 1000) + 5 * 60;
    const signature = this.signProtected(assetId, userId, expires);
    return `${this.environment.PUBLIC_API_URL}/api/media/images/${assetId}?user=${userId}&expires=${expires}&v=1&signature=${signature}`;
  }

  public verify(assetId: string, expires: number, signature: string): boolean {
    if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    const expected = Buffer.from(this.sign(assetId, expires), "hex");
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  public verifyProtectedImage(
    assetId: string,
    userId: string,
    expires: number,
    signature: string,
  ): boolean {
    if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000)) return false;
    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    const expected = Buffer.from(this.signProtected(assetId, userId, expires), "hex");
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  }

  private sign(assetId: string, expires: number): string {
    return createHmac("sha256", this.environment.MEDIA_SIGNING_SECRET)
      .update(`public-cover:${assetId}:${expires}`)
      .digest("hex");
  }

  private signProtected(assetId: string, userId: string, expires: number): string {
    return createHmac("sha256", this.environment.MEDIA_SIGNING_SECRET)
      .update(`protected-image:v1:${assetId}:${userId}:${expires}`)
      .digest("hex");
  }
}
