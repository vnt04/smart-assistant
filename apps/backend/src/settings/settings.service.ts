import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { UpdateSettingsInput, UserSettings } from "@assistant/shared";
import { CryptoService } from "../common/crypto/crypto.service";
import { UserSettingsEntity } from "./user-settings.entity";

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
    };
  }
}
