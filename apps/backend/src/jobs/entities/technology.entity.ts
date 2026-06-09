import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

/**
 * Công nghệ đã chuẩn hóa (React, TypeScript, …). Bảng global, không gắn
 * `user_id` — giống `jobs`. `slug` là khóa hợp nhất biến thể ("React"/"ReactJS"
 * → `react`) và là khóa lọc; `name` là nhãn hiển thị. Quan hệ N–N với `jobs`
 * qua bảng nối `job_technologies`.
 */
@Entity({ name: "technologies" })
export class TechnologyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("uq_technologies_slug", { unique: true })
  @Column({ type: "varchar", length: 64 })
  slug!: string;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
