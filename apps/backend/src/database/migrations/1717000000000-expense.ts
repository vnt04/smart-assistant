import { MigrationInterface, QueryRunner } from "typeorm";

export class Expense1717000000000 implements MigrationInterface {
  name = "Expense1717000000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE wallets (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        type ENUM('cash','bank','e_wallet','credit_card') NOT NULL,
        balance DECIMAL(15,0) NOT NULL DEFAULT 0,
        icon VARCHAR(64) NULL,
        color VARCHAR(16) NULL,
        archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_wallets_user (user_id, archived),
        CONSTRAINT fk_wallets_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE categories (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        parent_id CHAR(36) NULL,
        name VARCHAR(120) NOT NULL,
        kind ENUM('expense','income') NOT NULL,
        icon VARCHAR(64) NULL,
        color VARCHAR(16) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_categories_user_kind (user_id, kind),
        KEY ix_categories_parent (parent_id),
        CONSTRAINT fk_categories_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_categories_parent
          FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE transactions (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        wallet_id CHAR(36) NOT NULL,
        transfer_to_wallet_id CHAR(36) NULL,
        category_id CHAR(36) NULL,
        kind ENUM('expense','income','transfer') NOT NULL,
        amount DECIMAL(15,0) NOT NULL,
        occurred_at DATETIME(6) NOT NULL,
        note VARCHAR(500) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_tx_user_occurred (user_id, occurred_at),
        KEY ix_tx_wallet (wallet_id),
        KEY ix_tx_transfer (transfer_to_wallet_id),
        KEY ix_tx_category (category_id),
        KEY ix_tx_user_kind_occurred (user_id, kind, occurred_at),
        CONSTRAINT fk_tx_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_tx_wallet
          FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
        CONSTRAINT fk_tx_transfer
          FOREIGN KEY (transfer_to_wallet_id) REFERENCES wallets(id) ON DELETE RESTRICT,
        CONSTRAINT fk_tx_category
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE budgets (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        category_id CHAR(36) NOT NULL,
        month CHAR(7) NOT NULL,
        amount DECIMAL(15,0) NOT NULL,
        alert_threshold_pct TINYINT UNSIGNED NOT NULL DEFAULT 80,
        alerted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_budgets_user_cat_month (user_id, category_id, month),
        KEY ix_budgets_user_month (user_id, month),
        CONSTRAINT fk_budgets_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_budgets_category
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      ALTER TABLE user_settings
        ADD CONSTRAINT fk_user_settings_default_wallet
        FOREIGN KEY (default_wallet_id) REFERENCES wallets(id) ON DELETE SET NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_settings DROP FOREIGN KEY fk_user_settings_default_wallet
    `);
    await q.query(`DROP TABLE IF EXISTS budgets`);
    await q.query(`DROP TABLE IF EXISTS transactions`);
    await q.query(`DROP TABLE IF EXISTS categories`);
    await q.query(`DROP TABLE IF EXISTS wallets`);
  }
}
