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

@Entity({ name: "tags" })
@Index("uq_tags_user_name", ["userId", "name"], { unique: true })
export class TagEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "user_id", type: "char", length: 36 })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: UserEntity;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
