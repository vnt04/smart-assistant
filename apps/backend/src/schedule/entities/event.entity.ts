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
import { UserEntity } from "../../users/entities/user.entity";

@Entity({ name: "events" })
@Index("ix_events_user_start", ["userId", "startAt"])
@Index("ix_events_user_range", ["userId", "startAt", "endAt"])
export class EventEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_events_user")
  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "start_at", type: "datetime", precision: 6 })
  startAt!: Date;

  @Column({ name: "end_at", type: "datetime", precision: 6 })
  endAt!: Date;

  @Column({ name: "all_day", type: "tinyint", width: 1, default: 0 })
  allDay!: boolean;

  @Column({ type: "varchar", length: 255, nullable: true })
  location!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
