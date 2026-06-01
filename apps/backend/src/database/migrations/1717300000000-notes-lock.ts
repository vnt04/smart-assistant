import { MigrationInterface, QueryRunner } from "typeorm";

export class NotesLock1717300000000 implements MigrationInterface {
  name = "NotesLock1717300000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE notes ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE notebooks ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0`,
    );
    await q.query(
      `ALTER TABLE user_settings ADD COLUMN notes_lock_hash VARCHAR(60) NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE user_settings DROP COLUMN notes_lock_hash`);
    await q.query(`ALTER TABLE notebooks DROP COLUMN is_locked`);
    await q.query(`ALTER TABLE notes DROP COLUMN is_locked`);
  }
}
