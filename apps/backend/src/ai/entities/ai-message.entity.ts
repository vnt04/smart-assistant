import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { AiRole } from "@assistant/shared";
import { AiConversationEntity } from "./ai-conversation.entity";
import { AiToolCallEntity } from "./ai-tool-call.entity";

@Entity({ name: "ai_messages" })
@Index("ix_ai_messages_conversation_created", ["conversationId", "createdAt"])
export class AiMessageEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "conversation_id", type: "char", length: 36 })
  conversationId!: string;

  @ManyToOne(() => AiConversationEntity, (conversation) => conversation.messages, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "conversation_id" })
  conversation?: AiConversationEntity;

  @Column({ type: "enum", enum: ["user", "assistant", "tool"] })
  role!: AiRole;

  @Column({ type: "longtext" })
  content!: string;

  @Column({ type: "varchar", length: 32, nullable: true })
  provider!: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  model!: string | null;

  @Column({ name: "input_tokens", type: "int", unsigned: true, nullable: true })
  inputTokens!: number | null;

  @Column({ name: "output_tokens", type: "int", unsigned: true, nullable: true })
  outputTokens!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @OneToMany(() => AiToolCallEntity, (toolCall) => toolCall.message)
  toolCalls?: AiToolCallEntity[];
}
