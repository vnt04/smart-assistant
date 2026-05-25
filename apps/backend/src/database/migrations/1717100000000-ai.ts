import { MigrationInterface, QueryRunner } from "typeorm";

export class Ai1717100000000 implements MigrationInterface {
  name = "Ai1717100000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE ai_conversations (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_ai_conversations_user_updated (user_id, updated_at),
        CONSTRAINT fk_ai_conversations_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE ai_messages (
        id CHAR(36) NOT NULL,
        conversation_id CHAR(36) NOT NULL,
        role ENUM('user','assistant','tool') NOT NULL,
        content LONGTEXT NOT NULL,
        provider VARCHAR(32) NULL,
        model VARCHAR(120) NULL,
        input_tokens INT UNSIGNED NULL,
        output_tokens INT UNSIGNED NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_ai_messages_conversation_created (conversation_id, created_at),
        CONSTRAINT fk_ai_messages_conversation
          FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE ai_tool_calls (
        id CHAR(36) NOT NULL,
        message_id CHAR(36) NOT NULL,
        name VARCHAR(64) NOT NULL,
        arguments_json JSON NOT NULL,
        result_json JSON NULL,
        status ENUM('pending','executed','rejected') NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        executed_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        KEY ix_ai_tool_calls_message (message_id),
        CONSTRAINT fk_ai_tool_calls_message
          FOREIGN KEY (message_id) REFERENCES ai_messages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS ai_tool_calls`);
    await q.query(`DROP TABLE IF EXISTS ai_messages`);
    await q.query(`DROP TABLE IF EXISTS ai_conversations`);
  }
}
