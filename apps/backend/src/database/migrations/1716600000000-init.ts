import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1716600000000 implements MigrationInterface {
  name = "Init1716600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE users (
        id CHAR(36) NOT NULL,
        email VARCHAR(254) NOT NULL,
        password_hash VARCHAR(60) NULL,
        google_id VARCHAR(64) NULL,
        name VARCHAR(100) NOT NULL,
        avatar_url VARCHAR(500) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email),
        UNIQUE KEY uq_users_google_id (google_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE user_settings (
        user_id CHAR(36) NOT NULL,
        ai_provider VARCHAR(16) NOT NULL DEFAULT 'claude',
        ai_api_key_enc VARCHAR(1024) NULL,
        telegram_bot_token_enc VARCHAR(1024) NULL,
        telegram_chat_id VARCHAR(64) NULL,
        theme VARCHAR(16) NOT NULL DEFAULT 'system',
        default_wallet_id CHAR(36) NULL,
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (user_id),
        CONSTRAINT fk_user_settings_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE refresh_tokens (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_refresh_token_hash (token_hash),
        KEY ix_refresh_token_user (user_id),
        CONSTRAINT fk_refresh_token_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS refresh_tokens`);
    await q.query(`DROP TABLE IF EXISTS user_settings`);
    await q.query(`DROP TABLE IF EXISTS users`);
  }
}
