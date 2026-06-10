import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import {
  normalizeJobMatchProfile,
  type JobMatchProfile,
  type SetNotesLockInput,
  type UpdateSettingsInput,
  type UserSettings,
} from "@assistant/shared";
import { CryptoService } from "../common/crypto/crypto.service";
import { UserSettingsEntity } from "./user-settings.entity";

const BCRYPT_COST = 12;

/** Cấu hình n8n đã giải mã, đủ để gọi public API (/api/v1) của n8n. */
export interface N8nConfig {
  baseUrl: string;
  apiKey: string;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly repo: Repository<UserSettingsEntity>,
    private readonly crypto: CryptoService,
  ) {}

  async initForUser(userId: string): Promise<UserSettingsEntity> {
    const entity = this.repo.create({
      userId,
      aiProvider: "claude",
      aiApiKeyEnc: null,
      telegramBotTokenEnc: null,
      telegramChatId: null,
      theme: "system",
      defaultWalletId: null,
      n8nBaseUrl: null,
      n8nApiKeyEnc: null,
    });
    return this.repo.save(entity);
  }

  async getForUser(userId: string): Promise<UserSettings> {
    const entity = await this.repo.findOne({ where: { userId } });
    if (!entity) {
      throw new NotFoundException({
        code: "settings_not_found",
        message: "Không tìm thấy settings",
      });
    }
    return this.toDto(entity);
  }

  async update(
    userId: string,
    input: UpdateSettingsInput,
  ): Promise<UserSettings> {
    const entity =
      (await this.repo.findOne({ where: { userId } })) ??
      (await this.initForUser(userId));

    if (input.aiProvider !== undefined) entity.aiProvider = input.aiProvider;
    if (input.theme !== undefined) entity.theme = input.theme;
    if (input.defaultWalletId !== undefined)
      entity.defaultWalletId = input.defaultWalletId;
    if (input.telegramChatId !== undefined)
      entity.telegramChatId = input.telegramChatId;

    if (input.aiApiKey !== undefined) {
      entity.aiApiKeyEnc =
        input.aiApiKey === null ? null : this.crypto.encrypt(input.aiApiKey);
    }
    if (input.telegramBotToken !== undefined) {
      entity.telegramBotTokenEnc =
        input.telegramBotToken === null
          ? null
          : this.crypto.encrypt(input.telegramBotToken);
    }

    if (input.n8nBaseUrl !== undefined) {
      entity.n8nBaseUrl =
        input.n8nBaseUrl === null ? null : normalizeBaseUrl(input.n8nBaseUrl);
    }
    if (input.n8nApiKey !== undefined) {
      const key = input.n8nApiKey?.trim() ?? "";
      entity.n8nApiKeyEnc = key === "" ? null : this.crypto.encrypt(key);
    }

    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  /** Cấu hình n8n đã giải mã; thiếu base URL hoặc API key → null (chưa cấu hình). */
  async getN8nConfig(userId: string): Promise<N8nConfig | null> {
    const entity = await this.repo.findOne({ where: { userId } });
    if (!entity?.n8nBaseUrl || !entity.n8nApiKeyEnc) return null;
    return {
      baseUrl: entity.n8nBaseUrl,
      apiKey: this.crypto.decrypt(entity.n8nApiKeyEnc),
    };
  }

  /* -------------------- Matching Job (barem chấm điểm) -------------------- */

  /** Barem của user; chưa cấu hình hoặc chưa có settings → barem mặc định. */
  async getJobMatchProfile(userId: string): Promise<JobMatchProfile> {
    const entity = await this.repo.findOne({ where: { userId } });
    return normalizeJobMatchProfile(entity?.jobMatchPrefs ?? null);
  }

  /** Lưu trọn barem (PUT). Chuẩn hóa trước khi ghi để dữ liệu luôn hợp lệ. */
  async updateJobMatchProfile(
    userId: string,
    input: JobMatchProfile,
  ): Promise<JobMatchProfile> {
    const entity =
      (await this.repo.findOne({ where: { userId } })) ??
      (await this.initForUser(userId));
    const profile = normalizeJobMatchProfile(input);
    entity.jobMatchPrefs = profile;
    await this.repo.save(entity);
    return profile;
  }

  /* -------------------- Notes lock password -------------------- */

  async hasNotesLock(userId: string): Promise<boolean> {
    const entity = await this.repo.findOne({
      where: { userId },
      select: ["userId", "notesLockHash"],
    });
    return Boolean(entity?.notesLockHash);
  }

  /**
   * Đặt mới (lần đầu) hoặc đổi mật khẩu khóa. Nếu đã có hash thì bắt buộc
   * currentPassword đúng. Trả về UserSettings sau khi cập nhật.
   */
  async setNotesLock(
    userId: string,
    input: SetNotesLockInput,
  ): Promise<UserSettings> {
    const entity =
      (await this.repo.findOne({ where: { userId } })) ??
      (await this.initForUser(userId));

    if (entity.notesLockHash) {
      const ok =
        input.currentPassword != null &&
        (await bcrypt.compare(input.currentPassword, entity.notesLockHash));
      if (!ok) {
        throw new UnauthorizedException({
          code: "notes_lock_invalid",
          message: "Mật khẩu hiện tại không đúng",
        });
      }
    }

    entity.notesLockHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async verifyNotesLock(userId: string, password: string): Promise<boolean> {
    const entity = await this.repo.findOne({
      where: { userId },
      select: ["userId", "notesLockHash"],
    });
    if (!entity?.notesLockHash) return false;
    return bcrypt.compare(password, entity.notesLockHash);
  }

  /** Xác minh mật khẩu khóa, sai thì ném 401 với thông điệp đồng nhất. */
  async requireNotesLock(userId: string, password: string): Promise<void> {
    const ok = await this.verifyNotesLock(userId, password);
    if (!ok) {
      throw new UnauthorizedException({
        code: "notes_lock_invalid",
        message: "Mật khẩu không đúng",
      });
    }
  }

  /**
   * Xóa mật khẩu khóa. Bắt buộc mở khóa toàn bộ note/notebook của user — nếu
   * không, các mục đã khóa sẽ vĩnh viễn không mở được vì không còn mật khẩu.
   */
  async clearNotesLock(
    userId: string,
    password: string,
  ): Promise<UserSettings> {
    const entity = await this.repo.findOne({ where: { userId } });
    if (!entity) {
      throw new NotFoundException({
        code: "settings_not_found",
        message: "Không tìm thấy settings",
      });
    }
    await this.requireNotesLock(userId, password);

    entity.notesLockHash = null;
    const saved = await this.repo.save(entity);

    await this.repo.manager.query(
      `UPDATE notes SET is_locked = 0 WHERE user_id = ?`,
      [userId],
    );
    await this.repo.manager.query(
      `UPDATE notebooks SET is_locked = 0 WHERE user_id = ?`,
      [userId],
    );

    return this.toDto(saved);
  }

  async decryptAiApiKey(userId: string): Promise<string | null> {
    const entity = await this.repo.findOne({ where: { userId } });
    if (!entity?.aiApiKeyEnc) return null;
    return this.crypto.decrypt(entity.aiApiKeyEnc);
  }

  async decryptTelegramToken(userId: string): Promise<string | null> {
    const entity = await this.repo.findOne({ where: { userId } });
    if (!entity?.telegramBotTokenEnc) return null;
    return this.crypto.decrypt(entity.telegramBotTokenEnc);
  }

  private toDto(entity: UserSettingsEntity): UserSettings {
    return {
      aiProvider: entity.aiProvider,
      aiApiKeyMasked: entity.aiApiKeyEnc
        ? this.crypto.mask(this.crypto.decrypt(entity.aiApiKeyEnc))
        : null,
      telegramBotTokenMasked: entity.telegramBotTokenEnc
        ? this.crypto.mask(this.crypto.decrypt(entity.telegramBotTokenEnc))
        : null,
      telegramChatId: entity.telegramChatId,
      theme: entity.theme,
      defaultWalletId: entity.defaultWalletId,
      hasNotesLock: entity.notesLockHash != null,
      n8nBaseUrl: entity.n8nBaseUrl,
      n8nApiKeyMasked: entity.n8nApiKeyEnc
        ? this.crypto.mask(this.crypto.decrypt(entity.n8nApiKeyEnc))
        : null,
    };
  }
}

/** Bỏ dấu "/" cuối của base URL để ghép path API không bị "//". */
function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
