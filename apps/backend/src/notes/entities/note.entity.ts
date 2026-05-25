import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { UserEntity } from "../../users/entities/user.entity";
import { AttachmentEntity } from "./attachment.entity";
import { NotebookEntity } from "./notebook.entity";
import { TagEntity } from "./tag.entity";

@Entity({ name: "notes" })
@Index("ix_notes_user_updated", ["userId", "updatedAt"])
export class NoteEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_notes_user")
  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Index("ix_notes_notebook")
  @Column({ name: "notebook_id", type: "char", length: 36, nullable: true })
  notebookId!: string | null;

  @ManyToOne(() => NotebookEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "notebook_id" })
  notebook?: NotebookEntity | null;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ name: "content_html", type: "mediumtext" })
  contentHtml!: string;

  @Column({ name: "content_text", type: "mediumtext" })
  contentText!: string;

  @Column({ name: "is_pinned", type: "tinyint", width: 1, default: 0 })
  isPinned!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @ManyToMany(() => TagEntity)
  @JoinTable({
    name: "note_tags",
    joinColumn: { name: "note_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "tag_id", referencedColumnName: "id" },
  })
  tags?: TagEntity[];

  @OneToMany(() => AttachmentEntity, (a) => a.note)
  attachments?: AttachmentEntity[];
}
