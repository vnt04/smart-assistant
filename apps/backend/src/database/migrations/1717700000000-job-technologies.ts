import { randomUUID } from "node:crypto";
import { MigrationInterface, QueryRunner } from "typeorm";
import { normalizeTechList } from "../../jobs/tech-normalize";

/**
 * Chuẩn hóa công nghệ của job từ cột `tech_stack` JSON sang mô hình quan hệ:
 * bảng `technologies` (slug duy nhất) + bảng nối `job_technologies`. Cho phép
 * lọc/đếm facet theo từng công nghệ bằng index thay vì quét JSON.
 *
 * `up`: tạo bảng → backfill từ `tech_stack` hiện có → bỏ cột `tech_stack`.
 * `down`: dựng lại cột `tech_stack` JSON từ bảng nối rồi bỏ 2 bảng mới.
 */
export class JobTechnologies1717700000000 implements MigrationInterface {
  name = "JobTechnologies1717700000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE technologies (
        id CHAR(36) NOT NULL,
        slug VARCHAR(64) NOT NULL,
        name VARCHAR(64) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_technologies_slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE job_technologies (
        job_id CHAR(36) NOT NULL,
        technology_id CHAR(36) NOT NULL,
        PRIMARY KEY (job_id, technology_id),
        KEY ix_job_technologies_tech (technology_id, job_id),
        CONSTRAINT fk_job_tech_job
          FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        CONSTRAINT fk_job_tech_tech
          FOREIGN KEY (technology_id) REFERENCES technologies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Backfill: dựng technologies + job_technologies từ tech_stack hiện có.
    const jobs: Array<{ id: string; tech_stack: unknown }> = await q.query(
      "SELECT id, tech_stack FROM jobs",
    );
    const techIdBySlug = new Map<string, string>();

    for (const job of jobs) {
      const techs = normalizeTechList(parseTechStack(job.tech_stack));
      for (const tech of techs) {
        let techId = techIdBySlug.get(tech.slug);
        if (!techId) {
          techId = randomUUID();
          await q.query(
            "INSERT INTO technologies (id, slug, name) VALUES (?, ?, ?)",
            [techId, tech.slug, tech.name],
          );
          techIdBySlug.set(tech.slug, techId);
        }
        await q.query(
          "INSERT IGNORE INTO job_technologies (job_id, technology_id) VALUES (?, ?)",
          [job.id, techId],
        );
      }
    }

    await q.query("ALTER TABLE jobs DROP COLUMN tech_stack");
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE jobs ADD COLUMN tech_stack JSON NULL AFTER applicants",
    );

    const jobs: Array<{ id: string }> = await q.query("SELECT id FROM jobs");
    for (const job of jobs) {
      const rows: Array<{ name: string }> = await q.query(
        `SELECT t.name FROM job_technologies jt
           JOIN technologies t ON t.id = jt.technology_id
          WHERE jt.job_id = ? ORDER BY t.name`,
        [job.id],
      );
      await q.query("UPDATE jobs SET tech_stack = ? WHERE id = ?", [
        JSON.stringify(rows.map((r) => r.name)),
        job.id,
      ]);
    }

    await q.query("ALTER TABLE jobs MODIFY tech_stack JSON NOT NULL");
    await q.query("DROP TABLE IF EXISTS job_technologies");
    await q.query("DROP TABLE IF EXISTS technologies");
  }
}

/** tech_stack có thể là mảng đã parse (JSON column) hoặc chuỗi JSON. */
function parseTechStack(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  }
  return [];
}
