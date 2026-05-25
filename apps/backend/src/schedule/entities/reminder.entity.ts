import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { ReminderTargetType } from "@assistant/shared";
import { UserEntity } from "../../users/entities/user.entity";

@Entity({ name: "reminders" })
@Index("ix_reminders_target", ["targetType", "targetId"])
@Index("ix_reminders_due", ["sentAt", "remindAt"])
export class ReminderEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_reminders_user")
  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({
    name: "target_type",
    type: "enum",
    enum: ["event", "task"],
  })
  targetType!: ReminderTargetType;

  @Column({ name: "target_id", type: "char", length: 36 })
  targetId!: string;

  @Column({ name: "remind_at", type: "datetime", precision: 6 })
  remindAt!: Date;

  @Column({ name: "sent_at", type: "datetime", precision: 6, nullable: true })
  sentAt!: Date | null;

  @Column({ name: "job_id", type: "varchar", length: 128, nullable: true })
  jobId!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
