import { MigrationInterface, QueryRunner } from "typeorm";

export class NoteReferences1717600000000 implements MigrationInterface {
  name = "NoteReferences1717600000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE note_references (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        from_note_id CHAR(36) NOT NULL,
        to_note_id CHAR(36) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_note_references_pair (from_note_id, to_note_id),
        KEY ix_note_references_to (to_note_id),
        KEY ix_note_references_user (user_id),
        CONSTRAINT fk_note_references_from
          FOREIGN KEY (from_note_id) REFERENCES notes(id) ON DELETE CASCADE,
        CONSTRAINT fk_note_references_to
          FOREIGN KEY (to_note_id) REFERENCES notes(id) ON DELETE CASCADE,
        CONSTRAINT fk_note_references_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS note_references`);
  }
}
