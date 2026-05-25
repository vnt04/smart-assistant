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
import type { WalletType } from "@assistant/shared";
import { UserEntity } from "../../users/entities/user.entity";

@Entity({ name: "wallets" })
export class WalletEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("ix_wallets_user")
  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({
    type: "enum",
    enum: ["cash", "bank", "e_wallet", "credit_card"],
  })
  type!: WalletType;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 0,
    default: 0,
    transformer: {
      to: (value: number | string | null | undefined): string =>
        value === null || value === undefined ? "0" : String(value),
      from: (value: string | null): number =>
        value === null ? 0 : Number(value),
    },
  })
  balance!: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  icon!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  color!: string | null;

  @Column({ type: "tinyint", width: 1, default: 0 })
  archived!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
