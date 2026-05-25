import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { AiToolName, AiToolStatus } from "@assistant/shared";
import { AiMessageEntity } from "./ai-message.entity";

@Entity({ name: "ai_tool_calls" })
@Index("ix_ai_tool_calls_message", ["messageId"])
export class AiToolCallEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "message_id", type: "char", length: 36 })
  messageId!: string;

  @ManyToOne(() => AiMessageEntity, (message) => message.toolCalls, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "message_id" })
  message?: AiMessageEntity;

  @Column({ type: "varchar", length: 64 })
  name!: AiToolName;

  @Column({ name: "arguments_json", type: "json" })
  arguments!: Record<string, unknown>;

  @Column({ name: "result_json", type: "json", nullable: true })
  result!: unknown | null;

  @Column({ type: "enum", enum: ["pending", "executed", "rejected"] })
  status!: AiToolStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Column({ name: "executed_at", type: "datetime", precision: 6, nullable: true })
  executedAt!: Date | null;
}
