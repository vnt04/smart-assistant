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

@Entity({ name: "notebooks" })
export class NotebookEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_notebooks_user")
  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Index("ix_notebooks_parent")
  @Column({ name: "parent_id", type: "char", length: 36, nullable: true })
  parentId!: string | null;

  @ManyToOne(() => NotebookEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent?: NotebookEntity | null;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 16, nullable: true })
  color!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
