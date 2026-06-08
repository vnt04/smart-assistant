import { MigrationInterface, QueryRunner } from "typeorm";

export class NoteShares1717400000000 implements MigrationInterface {
  name = "NoteShares1717400000000";

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE shares (
        id CHAR(36) NOT NULL,
        owner_user_id CHAR(36) NOT NULL,
        resource_type VARCHAR(16) NOT NULL,
        resource_id CHAR(36) NOT NULL,
        token VARCHAR(64) NOT NULL,
        link_access VARCHAR(8) NOT NULL DEFAULT 'none',
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_shares_token (token),
        UNIQUE KEY uq_shares_resource (resource_type, resource_id),
        KEY ix_shares_owner (owner_user_id),
        CONSTRAINT fk_shares_owner
          FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await q.query(`
      CREATE TABLE share_invites (
        id CHAR(36) NOT NULL,
        share_id CHAR(36) NOT NULL,
        email VARCHAR(254) NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_share_invites_share_email (share_id, email),
        KEY ix_share_invites_share (share_id),
        KEY ix_share_invites_email (email),
        CONSTRAINT fk_share_invites_share
          FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS share_invites`);
    await q.query(`DROP TABLE IF EXISTS shares`);
  }
}
