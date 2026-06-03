import type { ShareLinkAccess, ShareResourceType } from "@assistant/shared";
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "../../users/entities/user.entity";
import { ShareInviteEntity } from "./share-invite.entity";

// Cấu hình chia sẻ cho một note hoặc notebook. Mỗi resource có tối đa một bản
// ghi (unique theo resource_type + resource_id).
@Entity({ name: "shares" })
@Index("uq_shares_resource", ["resourceType", "resourceId"], { unique: true })
export class ShareEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_shares_owner")
  @Column({ name: "owner_user_id", type: "char", length: 36 })
  ownerUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "owner_user_id" })
  owner?: UserEntity;

  @Column({ name: "resource_type", type: "varchar", length: 16 })
  resourceType!: ShareResourceType;

  @Column({ name: "resource_id", type: "char", length: 36 })
  resourceId!: string;

  // Token bí mật đưa vào URL /share/:token (entropy cao, unique).
  @Index("uq_shares_token", { unique: true })
  @Column({ type: "varchar", length: 64 })
  token!: string;

  @Column({ name: "link_access", type: "varchar", length: 8, default: "none" })
  linkAccess!: ShareLinkAccess;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => ShareInviteEntity, (invite) => invite.share)
  invites?: ShareInviteEntity[];
}
