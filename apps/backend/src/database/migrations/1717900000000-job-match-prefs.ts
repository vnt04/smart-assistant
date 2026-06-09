import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Thêm cột `job_match_prefs` (JSON) cho `user_settings` — lưu barem chấm điểm
 * "Matching Job" của từng user. NULL = dùng barem mặc định.
 */
export class JobMatchPrefs1717900000000 implements MigrationInterface {
  name = "JobMatchPrefs1717900000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE user_settings ADD COLUMN job_match_prefs JSON NULL",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE user_settings DROP COLUMN job_match_prefs");
  }
}
