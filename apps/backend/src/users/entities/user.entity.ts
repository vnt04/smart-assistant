import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { RefreshTokenEntity } from "../../auth/refresh-token.entity";
import { UserSettingsEntity } from "../../settings/user-settings.entity";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 254 })
  email!: string;

  @Column({ name: "password_hash", type: "varchar", length: 60, nullable: true })
  passwordHash!: string | null;

  @Index({ unique: true, where: "google_id IS NOT NULL" })
  @Column({ name: "google_id", type: "varchar", length: 64, nullable: true })
  googleId!: string | null;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "avatar_url", type: "varchar", length: 500, nullable: true })
  avatarUrl!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToOne(() => UserSettingsEntity, (s) => s.user)
  settings?: UserSettingsEntity;

  @OneToMany(() => RefreshTokenEntity, (t) => t.user)
  refreshTokens?: RefreshTokenEntity[];
}
