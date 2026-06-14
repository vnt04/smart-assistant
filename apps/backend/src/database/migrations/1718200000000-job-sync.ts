import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Đồng bộ việc làm tự động (cron VietnamWorks): bảng cấu hình nguồn sync
 * (`job_sync_sources`) và lịch sử chạy (`job_sync_runs`). Cả hai là bảng global
 * (không gắn user_id) — giống `jobs`. Run tham chiếu nguồn qua FK SET NULL nên
 * lịch sử vẫn còn khi nguồn bị xóa.
 */
export class JobSync1718200000000 implements MigrationInterface {
  name = "JobSync1718200000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE job_sync_sources (
        id CHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        provider VARCHAR(32) NOT NULL DEFAULT 'vietnamworks',
        queries JSON NOT NULL,
        filters JSON NOT NULL,
        hits_per_page INT NOT NULL DEFAULT 100,
        max_pages INT NOT NULL DEFAULT 3,
        schedule JSON NOT NULL,
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
        enabled TINYINT NOT NULL DEFAULT 1,
        last_status VARCHAR(16) NULL,
        last_run_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY ix_job_sync_sources_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE job_sync_runs (
        id CHAR(36) NOT NULL,
        source_id CHAR(36) NULL,
        source_name VARCHAR(120) NOT NULL,
        \`trigger\` VARCHAR(16) NOT NULL,
        status VARCHAR(16) NOT NULL,
        started_at DATETIME(6) NOT NULL,
        finished_at DATETIME(6) NULL,
        duration_ms INT UNSIGNED NULL,
        pages_fetched INT UNSIGNED NOT NULL DEFAULT 0,
        jobs_found INT UNSIGNED NOT NULL DEFAULT 0,
        jobs_created INT UNSIGNED NOT NULL DEFAULT 0,
        jobs_updated INT UNSIGNED NOT NULL DEFAULT 0,
        jobs_failed INT UNSIGNED NOT NULL DEFAULT 0,
        queries_run JSON NOT NULL,
        error_message TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_job_sync_runs_started_at (started_at),
        KEY ix_job_sync_runs_source_id (source_id),
        KEY ix_job_sync_runs_status (status),
        CONSTRAINT fk_job_sync_runs_source FOREIGN KEY (source_id)
          REFERENCES job_sync_sources (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS job_sync_runs`);
    await q.query(`DROP TABLE IF EXISTS job_sync_sources`);
  }
}
