import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import type { AiProvider, JobMatchProfile, Theme } from "@assistant/shared";
import { UserEntity } from "../users/entities/user.entity";

@Entity({ name: "user_settings" })
export class UserSettingsEntity {
  @PrimaryColumn({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @OneToOne(() => UserEntity, (u) => u.settings, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({
    name: "ai_provider",
    type: "varchar",
    length: 16,
    default: "claude",
  })
  aiProvider!: AiProvider;

  @Column({
    name: "ai_api_key_enc",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  aiApiKeyEnc!: string | null;

  @Column({
    name: "telegram_bot_token_enc",
    type: "varchar",
    length: 1024,
    nullable: true,
  })
  telegramBotTokenEnc!: string | null;

  @Column({
    name: "telegram_chat_id",
    type: "varchar",
    length: 64,
    nullable: true,
  })
  telegramChatId!: string | null;

  @Column({ type: "varchar", length: 16, default: "system" })
  theme!: Theme;

  @Column({
    name: "default_wallet_id",
    type: "char",
    length: 36,
    nullable: true,
  })
  defaultWalletId!: string | null;

  // bcrypt hash của mật khẩu khóa ghi chú (NULL = chưa đặt). Không bao giờ trả ra DTO.
  @Column({
    name: "notes_lock_hash",
    type: "varchar",
    length: 60,
    nullable: true,
  })
  notesLockHash!: string | null;

  // Barem chấm điểm "Matching Job" của user (NULL = dùng mặc định). Không nhạy
  // cảm nên lưu JSON thường, không mã hóa.
  @Column({ name: "job_match_prefs", type: "json", nullable: true })
  jobMatchPrefs!: JobMatchProfile | null;

  // Cấu hình n8n cho "Quản lý Workflow Exc". Base URL không nhạy cảm; API key
  // công khai (X-N8N-API-KEY) được mã hóa AES-256-GCM, không trả plaintext ra DTO.
  @Column({ name: "n8n_base_url", type: "varchar", length: 512, nullable: true })
  n8nBaseUrl!: string | null;

  @Column({
    name: "n8n_api_key_enc",
    type: "varchar",
    length: 2048,
    nullable: true,
  })
  n8nApiKeyEnc!: string | null;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
