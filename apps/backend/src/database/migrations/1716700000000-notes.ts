import { MigrationInterface, QueryRunner } from "typeorm";

export class Notes1716700000000 implements MigrationInterface {
  name = "Notes1716700000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE notebooks (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        parent_id CHAR(36) NULL,
        name VARCHAR(120) NOT NULL,
        color VARCHAR(16) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_notebooks_user (user_id),
        KEY ix_notebooks_parent (parent_id),
        CONSTRAINT fk_notebooks_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_notebooks_parent
          FOREIGN KEY (parent_id) REFERENCES notebooks(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE notes (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        notebook_id CHAR(36) NULL,
        title VARCHAR(255) NOT NULL,
        content_html MEDIUMTEXT NOT NULL,
        content_text MEDIUMTEXT NOT NULL,
        is_pinned TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_notes_user (user_id),
        KEY ix_notes_notebook (notebook_id),
        KEY ix_notes_user_updated (user_id, updated_at),
        FULLTEXT KEY ft_notes_title_text (title, content_text) WITH PARSER ngram,
        CONSTRAINT fk_notes_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_notes_notebook
          FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE tags (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        name VARCHAR(64) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_tags_user_name (user_id, name),
        CONSTRAINT fk_tags_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE note_tags (
        note_id CHAR(36) NOT NULL,
        tag_id CHAR(36) NOT NULL,
        PRIMARY KEY (note_id, tag_id),
        KEY ix_note_tags_tag (tag_id),
        CONSTRAINT fk_note_tags_note
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        CONSTRAINT fk_note_tags_tag
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE attachments (
        id CHAR(36) NOT NULL,
        note_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        stored_path VARCHAR(512) NOT NULL,
        mime VARCHAR(127) NOT NULL,
        size_bytes INT UNSIGNED NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_attachments_note (note_id),
        KEY ix_attachments_user (user_id),
        CONSTRAINT fk_attachments_note
          FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        CONSTRAINT fk_attachments_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS attachments`);
    await q.query(`DROP TABLE IF EXISTS note_tags`);
    await q.query(`DROP TABLE IF EXISTS tags`);
    await q.query(`DROP TABLE IF EXISTS notes`);
    await q.query(`DROP TABLE IF EXISTS notebooks`);
  }
}
