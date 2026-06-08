import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { UserEntity } from "../../users/entities/user.entity";
import { NoteEntity } from "./note.entity";

/**
 * Liên kết nội bộ giữa hai ghi chú: `from_note` mention `to_note` qua `@`.
 * Bảng này được đồng bộ lại mỗi khi nội dung ghi chú nguồn được lưu (parse các
 * mention trong HTML) — là nguồn cho cả "liên kết tới" lẫn backlinks. FK CASCADE
 * theo cả hai phía để khi xóa note thì các liên kết liên quan tự dọn.
 */
@Entity({ name: "note_references" })
@Index("uq_note_references_pair", ["fromNoteId", "toNoteId"], { unique: true })
@Index("ix_note_references_to", ["toNoteId"])
export class NoteReferenceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ name: "from_note_id", type: "char", length: 36 })
  fromNoteId!: string;

  @ManyToOne(() => NoteEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "from_note_id" })
  fromNote?: NoteEntity;

  @Column({ name: "to_note_id", type: "char", length: 36 })
  toNoteId!: string;

  @ManyToOne(() => NoteEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "to_note_id" })
  toNote?: NoteEntity;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
