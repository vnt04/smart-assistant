import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { CategoryKind } from "@assistant/shared";
import { UserEntity } from "../../users/entities/user.entity";

@Entity({ name: "categories" })
@Index("ix_categories_user_kind", ["userId", "kind"])
export class CategoryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Index("ix_categories_parent")
  @Column({ name: "parent_id", type: "char", length: 36, nullable: true })
  parentId!: string | null;

  @ManyToOne(() => CategoryEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "parent_id" })
  parent?: CategoryEntity | null;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "enum", enum: ["expense", "income"] })
  kind!: CategoryKind;

  @Column({ type: "varchar", length: 64, nullable: true })
  icon!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  color!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
