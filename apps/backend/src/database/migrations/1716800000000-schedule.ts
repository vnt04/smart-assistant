import { MigrationInterface, QueryRunner } from "typeorm";

export class Schedule1716800000000 implements MigrationInterface {
  name = "Schedule1716800000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE events (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        start_at DATETIME(6) NOT NULL,
        end_at DATETIME(6) NOT NULL,
        all_day TINYINT(1) NOT NULL DEFAULT 0,
        location VARCHAR(255) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_events_user (user_id),
        KEY ix_events_user_start (user_id, start_at),
        KEY ix_events_user_range (user_id, start_at, end_at),
        CONSTRAINT fk_events_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE tasks (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
        status ENUM('todo','doing','done') NOT NULL DEFAULT 'todo',
        deadline DATETIME(6) NULL,
        completed_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_tasks_user (user_id),
        KEY ix_tasks_user_status (user_id, status),
        KEY ix_tasks_user_deadline (user_id, deadline),
        CONSTRAINT fk_tasks_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE reminders (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        target_type ENUM('event','task') NOT NULL,
        target_id CHAR(36) NOT NULL,
        remind_at DATETIME(6) NOT NULL,
        sent_at DATETIME(6) NULL,
        job_id VARCHAR(128) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_reminders_user (user_id),
        KEY ix_reminders_target (target_type, target_id),
        KEY ix_reminders_due (sent_at, remind_at),
        CONSTRAINT fk_reminders_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS reminders`);
    await q.query(`DROP TABLE IF EXISTS tasks`);
    await q.query(`DROP TABLE IF EXISTS events`);
  }
}
