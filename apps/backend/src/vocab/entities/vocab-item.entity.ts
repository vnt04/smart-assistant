import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "vocab_items" })
export class VocabItemEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /** Text as the client sent it, after trim + whitespace-collapse (original casing). */
  @Column({ type: "varchar", length: 50 })
  text!: string;

  /** Lowercased, whitespace-collapsed form used for case-insensitive dedup. */
  @Index("uq_vocab_normalized", { unique: true })
  @Column({ type: "varchar", length: 50 })
  normalized!: string;

  @Column({ type: "int", unsigned: true, default: 1 })
  count!: number;

  @Column({ type: "varchar", length: 1000, default: "" })
  notes!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
