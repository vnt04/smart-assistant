import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { TechnologyEntity } from "./technology.entity";

/**
 * Job crawl từ nguồn ngoài (LinkedIn, …) đẩy vào qua n8n. Bảng global, không gắn
 * `user_id` — giống `vocab_items`, đây là dữ liệu chung của hệ thống tự lưu trữ.
 * `job_id` (id gốc bên nguồn) là khóa chống trùng; re-crawl sẽ upsert.
 */
@Entity({ name: "jobs" })
export class JobEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index("uq_jobs_job_id", { unique: true })
  @Column({ name: "job_id", type: "varchar", length: 64 })
  jobId!: string;

  @Column({ name: "job_url", type: "varchar", length: 1024, default: "" })
  jobUrl!: string;

  @Column({ type: "varchar", length: 32, default: "unknown" })
  source!: string;

  @Column({ type: "varchar", length: 512 })
  title!: string;

  @Column({ type: "varchar", length: 255, default: "" })
  company!: string;

  @Column({ name: "company_logo", type: "varchar", length: 1024, default: "" })
  companyLogo!: string;

  @Column({ type: "varchar", length: 255, default: "" })
  location!: string;

  @Column({ name: "salary_min", type: "int", unsigned: true, nullable: true })
  salaryMin!: number | null;

  @Column({ name: "salary_max", type: "int", unsigned: true, nullable: true })
  salaryMax!: number | null;

  @Column({ name: "salary_currency", type: "varchar", length: 8, nullable: true })
  salaryCurrency!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  level!: string | null;

  @Column({ name: "employment_type", type: "varchar", length: 64, nullable: true })
  employmentType!: string | null;

  /** Chỉ phần ngày (`YYYY-MM-DD`); TypeORM cột `date` trả về chuỗi. */
  @Column({ name: "posted_at", type: "date", nullable: true })
  postedAt!: string | null;

  @Column({ type: "date", nullable: true })
  deadline!: string | null;

  @Column({ type: "varchar", length: 128, nullable: true })
  applicants!: string | null;

  /**
   * Công nghệ đã chuẩn hóa, lưu quan hệ N–N qua `job_technologies` (thay cho
   * cột `tech_stack` JSON trước đây). Hiển thị lấy `technologies[].name`; lọc
   * theo `technologies[].slug`.
   */
  @ManyToMany(() => TechnologyEntity)
  @JoinTable({
    name: "job_technologies",
    joinColumn: { name: "job_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "technology_id", referencedColumnName: "id" },
  })
  technologies?: TechnologyEntity[];

  @Column({ type: "json" })
  requirements!: string[];

  @Column({ type: "json" })
  responsibilities!: string[];

  @Column({ type: "json" })
  benefits!: string[];

  @Column({ type: "mediumtext" })
  description!: string;

  @Column({ name: "fit_score", type: "int", nullable: true })
  fitScore!: number | null;

  @Column({ name: "fit_reason", type: "text", nullable: true })
  fitReason!: string | null;

  /** Thời điểm crawler thu thập (do payload cung cấp). */
  @Column({ name: "crawl_at", type: "datetime", precision: 6 })
  crawlAt!: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
