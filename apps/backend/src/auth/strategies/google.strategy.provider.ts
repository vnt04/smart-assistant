import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, type Profile, type VerifyCallback } from "passport-google-oauth20";
import type { Env } from "../../config/env.validation";
import { AuthService } from "../auth.service";
import { CategoriesService } from "../../expense/categories.service";
import { SettingsService } from "../../settings/settings.service";
import { UsersService } from "../../users/users.service";

/**
 * Registered only when Google credentials are present.
 * `passport.use("google", ...)` happens inside the constructor via PassportStrategy.
 */
@Injectable()
export class GoogleStrategyProvider {
  private readonly logger = new Logger(GoogleStrategyProvider.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly categories: CategoriesService,
    private readonly auth: AuthService,
  ) {
    const clientID = this.config.get("GOOGLE_CLIENT_ID", { infer: true });
    const clientSecret = this.config.get("GOOGLE_CLIENT_SECRET", { infer: true });
    if (!clientID || !clientSecret) {
      this.logger.warn("Google OAuth disabled (no GOOGLE_CLIENT_ID/SECRET set)");
      return;
    }
    new GoogleStrategy(
      this.config,
      this.users,
      this.settings,
      this.categories,
      this.auth,
    ).register();
  }
}

class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly categories: CategoriesService,
    private readonly auth: AuthService,
  ) {
    super({
      clientID: config.get("GOOGLE_CLIENT_ID", { infer: true }),
      clientSecret: config.get("GOOGLE_CLIENT_SECRET", { infer: true }),
      callbackURL: config.get("GOOGLE_CALLBACK_URL", { infer: true }),
      scope: ["email", "profile"],
    });
  }

  register(): void {
    // PassportStrategy auto-registers on construction.
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      if (!email) {
        return done(new Error("Google account has no email"), undefined);
      }
      let user =
        (await this.users.findByGoogleId(profile.id)) ??
        (await this.users.findByEmail(email));
      if (!user) {
        user = await this.users.create({
          email,
          passwordHash: null,
          googleId: profile.id,
          name: profile.displayName ?? email.split("@")[0]!,
          avatarUrl: profile.photos?.[0]?.value ?? null,
        });
        await this.settings.initForUser(user.id);
        await this.categories.seedDefaults(user.id);
      } else if (!user.googleId) {
        await this.users.linkGoogle(user.id, profile.id);
      }
      done(null, user);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
