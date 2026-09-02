import { BadRequestException, Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { telegramAuthRequestSchema } from "@film-bot/contracts";

import { AuthService } from "./auth.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  public constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("telegram")
  @HttpCode(200)
  @ApiOperation({ summary: "验证 Telegram Mini App initData 并签发业务会话" })
  public authenticate(@Body() body: unknown) {
    const parsed = telegramAuthRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: "请求参数无效",
        details: parsed.error.flatten(),
      });
    }
    return this.authService.authenticate(parsed.data.initData, parsed.data.audience);
  }
}
