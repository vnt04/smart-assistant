import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  type AuthTokens,
  type LogoutInput,
  type RefreshInput,
  type RegisterInput,
  type LoginInput,
  type UpdateSettingsInput,
  type UserProfile,
  type UserSettings,
  loginInputSchema,
  logoutInputSchema,
  refreshInputSchema,
  registerInputSchema,
  updateSettingsInputSchema,
} from "@assistant/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SettingsService } from "../settings/settings.service";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { UserEntity } from "../users/entities/user.entity";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body(new ZodValidationPipe(registerInputSchema)) input: RegisterInput,
  ): Promise<AuthTokens> {
    return this.auth.register(input);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(loginInputSchema)) input: LoginInput,
  ): Promise<AuthTokens> {
    return this.auth.login(input);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(refreshInputSchema)) input: RefreshInput,
  ): Promise<AuthTokens> {
    return this.auth.refresh(input.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ZodValidationPipe(logoutInputSchema)) input: LogoutInput,
  ): Promise<void> {
    await this.auth.logout(input.refreshToken);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UserEntity): UserProfile {
    return this.auth.toProfile(user);
  }

  @Get("settings")
  @UseGuards(JwtAuthGuard)
  getSettings(@CurrentUser() user: UserEntity): Promise<UserSettings> {
    return this.settings.getForUser(user.id);
  }

  @Patch("settings")
  @UseGuards(JwtAuthGuard)
  updateSettings(
    @CurrentUser() user: UserEntity,
    @Body(new ZodValidationPipe(updateSettingsInputSchema))
    input: UpdateSettingsInput,
  ): Promise<UserSettings> {
    return this.settings.update(user.id, input);
  }
}
