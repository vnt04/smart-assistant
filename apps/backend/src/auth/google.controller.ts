import {
  Controller,
  Get,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";
import type { Env } from "../config/env.validation";
import { AuthService } from "./auth.service";
import type { UserEntity } from "../users/entities/user.entity";

@Controller("auth/google")
export class GoogleAuthController {
  private readonly enabled: boolean;
  private readonly frontendCallback: string;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.enabled =
      !!config.get("GOOGLE_CLIENT_ID", { infer: true }) &&
      !!config.get("GOOGLE_CLIENT_SECRET", { infer: true });
    const apiBase = config.get("BACKEND_PUBLIC_URL", { infer: true });
    this.frontendCallback = apiBase.replace(/\/$/, "") + "/auth/callback";
  }

  @Get()
  @UseGuards(AuthGuard("google"))
  start(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: "google_oauth_disabled",
        message: "Google OAuth chưa được cấu hình",
      });
    }
  }

  @Get("callback")
  @UseGuards(AuthGuard("google"))
  async callback(
    @Req() req: Request & { user?: UserEntity },
    @Res() res: Response,
  ): Promise<void> {
    if (!req.user) {
      res.redirect(`/login?error=google_failed`);
      return;
    }
    const tokens = await this.auth.issueTokensForGoogleUser(req.user);
    const params = new URLSearchParams({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: String(tokens.expiresIn),
    });
    res.redirect(`/auth/callback#${params.toString()}`);
  }
}
