import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { TransactionKind } from "@assistant/shared";
import { UserEntity } from "../../users/entities/user.entity";
import { CategoryEntity } from "./category.entity";
import { WalletEntity } from "./wallet.entity";

const amountTransformer = {
  to: (value: number | string | null | undefined): string =>
    value === null || value === undefined ? "0" : String(value),
  from: (value: string | null): number => (value === null ? 0 : Number(value)),
};

@Entity({ name: "transactions" })
@Index("ix_tx_user_occurred", ["userId", "occurredAt"])
@Index("ix_tx_user_kind_occurred", ["userId", "kind", "occurredAt"])
export class TransactionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Index("ix_tx_wallet")
  @Column({ name: "wallet_id", type: "char", length: 36 })
  walletId!: string;

  @ManyToOne(() => WalletEntity, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "wallet_id" })
  wallet?: WalletEntity;

  @Index("ix_tx_transfer")
  @Column({
    name: "transfer_to_wallet_id",
    type: "char",
    length: 36,
    nullable: true,
  })
  transferToWalletId!: string | null;

  @ManyToOne(() => WalletEntity, { onDelete: "RESTRICT", nullable: true })
  @JoinColumn({ name: "transfer_to_wallet_id" })
  transferToWallet?: WalletEntity | null;

  @Index("ix_tx_category")
  @Column({ name: "category_id", type: "char", length: 36, nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => CategoryEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "category_id" })
  category?: CategoryEntity | null;

  @Column({ type: "enum", enum: ["expense", "income", "transfer"] })
  kind!: TransactionKind;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 0,
    transformer: amountTransformer,
  })
  amount!: number;

  @Column({ name: "occurred_at", type: "datetime", precision: 6 })
  occurredAt!: Date;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
