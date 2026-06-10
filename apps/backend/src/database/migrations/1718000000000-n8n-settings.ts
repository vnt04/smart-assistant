import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Thêm cấu hình n8n vào `user_settings` cho tính năng "Quản lý Workflow Exc":
 * base URL, cookie `n8n-auth` (mã hóa), và browserId khớp header `browser-id`.
 */
export class N8nSettings1718000000000 implements MigrationInterface {
  name = "N8nSettings1718000000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE user_settings ADD COLUMN n8n_base_url VARCHAR(512) NULL",
    );
    await q.query(
      "ALTER TABLE user_settings ADD COLUMN n8n_auth_cookie_enc VARCHAR(4096) NULL",
    );
    await q.query(
      "ALTER TABLE user_settings ADD COLUMN n8n_browser_id VARCHAR(128) NULL",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE user_settings DROP COLUMN n8n_browser_id");
    await q.query("ALTER TABLE user_settings DROP COLUMN n8n_auth_cookie_enc");
    await q.query("ALTER TABLE user_settings DROP COLUMN n8n_base_url");
  }
}
