import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { TaskPriority, TaskStatus } from "@assistant/shared";
import { UserEntity } from "../../users/entities/user.entity";

@Entity({ name: "tasks" })
@Index("ix_tasks_user_status", ["userId", "status"])
@Index("ix_tasks_user_deadline", ["userId", "deadline"])
export class TaskEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_tasks_user")
  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({
    type: "enum",
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  })
  priority!: TaskPriority;

  @Column({
    type: "enum",
    enum: ["todo", "doing", "done"],
    default: "todo",
  })
  status!: TaskStatus;

  @Column({ type: "datetime", precision: 6, nullable: true })
  deadline!: Date | null;

  @Column({ name: "completed_at", type: "datetime", precision: 6, nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
