import { MigrationInterface, QueryRunner } from "typeorm";

/** Thêm cột `company_logo` cho bảng `jobs` — URL logo công ty do n8n gửi về. */
export class JobCompanyLogo1717800000000 implements MigrationInterface {
  name = "JobCompanyLogo1717800000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE jobs ADD COLUMN company_logo VARCHAR(1024) NOT NULL DEFAULT '' AFTER company",
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE jobs DROP COLUMN company_logo");
  }
}
