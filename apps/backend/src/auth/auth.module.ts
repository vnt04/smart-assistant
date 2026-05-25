import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { Env } from "../config/env.validation";
import { ExpenseModule } from "../expense/expense.module";
import { SettingsModule } from "../settings/settings.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleAuthController } from "./google.controller";
import { GoogleStrategyProvider } from "./strategies/google.strategy.provider";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { RefreshTokenEntity } from "./refresh-token.entity";

@Module({
  imports: [
    PassportModule,
    UsersModule,
    SettingsModule,
    ExpenseModule,
    TypeOrmModule.forFeature([RefreshTokenEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get("JWT_ACCESS_SECRET", { infer: true }),
        signOptions: {
          expiresIn: config.get("JWT_ACCESS_TTL", { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController, GoogleAuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategyProvider],
  exports: [AuthService],
})
export class AuthModule {}
