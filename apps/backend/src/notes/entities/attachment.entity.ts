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

@Entity({ name: "attachments" })
export class AttachmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_attachments_note")
  @Column({ name: "note_id", type: "char", length: 36 })
  noteId!: string;

  @ManyToOne(() => NoteEntity, (n) => n.attachments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "note_id" })
  note?: NoteEntity;

  @Index("ix_attachments_user")
  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ name: "original_name", type: "varchar", length: 255 })
  originalName!: string;

  @Column({ name: "stored_path", type: "varchar", length: 512 })
  storedPath!: string;

  @Column({ type: "varchar", length: 127 })
  mime!: string;

  @Column({ name: "size_bytes", type: "int", unsigned: true })
  sizeBytes!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
