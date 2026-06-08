import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ShareEntity } from "./share.entity";

// Một email được mời xem resource. Người này phải đăng nhập đúng email mới xem
// được khi link công khai đang tắt.
@Entity({ name: "share_invites" })
@Index("uq_share_invites_share_email", ["shareId", "email"], { unique: true })
export class ShareInviteEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_share_invites_share")
  @Column({ name: "share_id", type: "char", length: 36 })
  shareId!: string;

  @ManyToOne(() => ShareEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "share_id" })
  share?: ShareEntity;

  @Index("ix_share_invites_email")
  @Column({ type: "varchar", length: 254 })
  email!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
