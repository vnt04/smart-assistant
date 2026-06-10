import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Chuyển n8n từ cookie nội bộ sang API key công khai (X-N8N-API-KEY): thêm cột
 * `n8n_api_key_enc`, bỏ `n8n_auth_cookie_enc` và `n8n_browser_id`. API key bền
 * hơn (30 ngày, tự đặt), không cần Browser ID và làm được cả retry qua /api/v1.
 */
export class N8nApiKey1718100000000 implements MigrationInterface {
  name = "N8nApiKey1718100000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE user_settings ADD COLUMN n8n_api_key_enc VARCHAR(2048) NULL",
    );
    await q.query("ALTER TABLE user_settings DROP COLUMN n8n_auth_cookie_enc");
    await q.query("ALTER TABLE user_settings DROP COLUMN n8n_browser_id");
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE user_settings ADD COLUMN n8n_browser_id VARCHAR(128) NULL",
    );
    await q.query(
      "ALTER TABLE user_settings ADD COLUMN n8n_auth_cookie_enc VARCHAR(4096) NULL",
    );
    await q.query("ALTER TABLE user_settings DROP COLUMN n8n_api_key_enc");
  }
}
