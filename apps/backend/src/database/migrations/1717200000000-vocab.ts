import { MigrationInterface, QueryRunner } from "typeorm";

export class Vocab1717200000000 implements MigrationInterface {
  name = "Vocab1717200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE vocab_items (
        id CHAR(36) NOT NULL,
        text VARCHAR(50) NOT NULL,
        normalized VARCHAR(50) NOT NULL,
        count INT UNSIGNED NOT NULL DEFAULT 1,
        notes VARCHAR(1000) NOT NULL DEFAULT '',
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_vocab_normalized (normalized),
        KEY ix_vocab_count (count)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS vocab_items`);
  }
}
