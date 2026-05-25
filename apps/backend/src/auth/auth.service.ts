import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { LessThan, Repository } from "typeorm";
import type {
  AuthTokens,
  LoginInput,
  RegisterInput,
  UserProfile,
} from "@assistant/shared";
import type { Env } from "../config/env.validation";
import { CryptoService } from "../common/crypto/crypto.service";
import { CategoriesService } from "../expense/categories.service";
import { SettingsService } from "../settings/settings.service";
import { UsersService } from "../users/users.service";
import { UserEntity } from "../users/entities/user.entity";
import { RefreshTokenEntity } from "./refresh-token.entity";

const BCRYPT_COST = 12;
const REFRESH_BYTES = 48;
const MS_PER_DAY = 86_400_000;

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly accessTtl: string;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly categories: CategoriesService,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    config: ConfigService<Env, true>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokens: Repository<RefreshTokenEntity>,
  ) {
    this.accessTtl = config.get("JWT_ACCESS_TTL", { infer: true });
    this.refreshTtlMs = parseTtlToMs(
      config.get("JWT_REFRESH_TTL", { infer: true }),
    );
  }

  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new ConflictException({
        code: "email_in_use",
        message: "Email đã được đăng ký",
      });
    }
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      googleId: null,
      name: input.name,
    });
    await this.settings.initForUser(user.id);
    await this.categories.seedDefaults(user.id);
    return this.issueTokens(user);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Email hoặc mật khẩu không đúng",
      });
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: "invalid_credentials",
        message: "Email hoặc mật khẩu không đúng",
      });
    }
    return this.issueTokens(user);
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.crypto.hashToken(rawRefreshToken);
    const record = await this.refreshTokens.findOne({
      where: { tokenHash },
      relations: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: "refresh_invalid",
        message: "Refresh token không hợp lệ",
      });
    }
    record.revokedAt = new Date();
    await this.refreshTokens.save(record);
    if (!record.user) {
      throw new UnauthorizedException({
        code: "refresh_invalid",
        message: "Refresh token không hợp lệ",
      });
    }
    return this.issueTokens(record.user);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.crypto.hashToken(rawRefreshToken);
    await this.refreshTokens.update({ tokenHash }, { revokedAt: new Date() });
  }

  async findUserById(id: string): Promise<UserEntity | null> {
    return this.users.findById(id);
  }

  async issueTokensForGoogleUser(user: UserEntity): Promise<AuthTokens> {
    return this.issueTokens(user);
  }

  toProfile(user: UserEntity): UserProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async issueTokens(user: UserEntity): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.accessTtl,
    });
    const expiresIn = ttlToSeconds(this.accessTtl);

    const refreshRaw = randomBytes(REFRESH_BYTES).toString("base64url");
    const tokenHash = this.crypto.hashToken(refreshRaw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    const entity = this.refreshTokens.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      revokedAt: null,
    });
    await this.refreshTokens.save(entity);
    return { accessToken, refreshToken: refreshRaw, expiresIn };
  }

  async pruneExpired(): Promise<void> {
    await this.refreshTokens.delete({ expiresAt: LessThan(new Date()) });
  }
}

function parseTtlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(match[1]);
  const unit = match[2];
  const mul =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : MS_PER_DAY;
  return n * mul;
}

function ttlToSeconds(ttl: string): number {
  return Math.floor(parseTtlToMs(ttl) / 1000);
}
