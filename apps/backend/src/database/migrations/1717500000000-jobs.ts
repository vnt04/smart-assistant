import { MigrationInterface, QueryRunner } from "typeorm";

export class Jobs1717500000000 implements MigrationInterface {
  name = "Jobs1717500000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE jobs (
        id CHAR(36) NOT NULL,
        job_id VARCHAR(64) NOT NULL,
        job_url VARCHAR(1024) NOT NULL DEFAULT '',
        source VARCHAR(32) NOT NULL DEFAULT 'unknown',
        title VARCHAR(512) NOT NULL,
        company VARCHAR(255) NOT NULL DEFAULT '',
        location VARCHAR(255) NOT NULL DEFAULT '',
        salary_min INT UNSIGNED NULL,
        salary_max INT UNSIGNED NULL,
        salary_currency VARCHAR(8) NULL,
        level VARCHAR(64) NULL,
        employment_type VARCHAR(64) NULL,
        posted_at DATE NULL,
        deadline DATE NULL,
        applicants VARCHAR(128) NULL,
        tech_stack JSON NOT NULL,
        requirements JSON NOT NULL,
        responsibilities JSON NOT NULL,
        benefits JSON NOT NULL,
        description MEDIUMTEXT NOT NULL,
        fit_score INT NULL,
        fit_reason TEXT NULL,
        crawl_at DATETIME(6) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_jobs_job_id (job_id),
        KEY ix_jobs_crawl_at (crawl_at),
        KEY ix_jobs_fit_score (fit_score)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS jobs`);
  }
}
