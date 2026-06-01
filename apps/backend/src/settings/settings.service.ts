import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";
import type {
  SetNotesLockInput,
  UpdateSettingsInput,
  UserSettings,
} from "@assistant/shared";
import { CryptoService } from "../common/crypto/crypto.service";
import { UserSettingsEntity } from "./user-settings.entity";

const BCRYPT_COST = 12;

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

    const saved = await this.repo.save(entity);
    return this.toDto(saved);
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
    };
  }
}
