import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from "typeorm";
import { UserEntity } from "../../users/entities/user.entity";
import { CategoryEntity } from "./category.entity";

const amountTransformer = {
  to: (v: number | string | null | undefined): string =>
    v === null || v === undefined ? "0" : String(v),
  from: (v: string | null): number => (v === null ? 0 : Number(v)),
};

@Entity({ name: "budgets" })
@Unique("uq_budgets_user_cat_month", ["userId", "categoryId", "month"])
@Index("ix_budgets_user_month", ["userId", "month"])
export class BudgetEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ name: "category_id", type: "char", length: 36 })
  categoryId!: string;

  @ManyToOne(() => CategoryEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category?: CategoryEntity;

  @Column({ type: "char", length: 7 })
  month!: string;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 0,
    transformer: amountTransformer,
  })
  amount!: number;

  @Column({
    name: "alert_threshold_pct",
    type: "tinyint",
    unsigned: true,
    default: 80,
  })
  alertThresholdPct!: number;

  @Column({ name: "alerted_at", type: "datetime", precision: 6, nullable: true })
  alertedAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
