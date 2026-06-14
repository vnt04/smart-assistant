import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type {
  JobSyncFilters,
  JobSyncRunStatus,
  JobSyncSchedule,
} from "@assistant/shared";

/**
 * Một nguồn đồng bộ việc làm tự động. Bảng global (không gắn `user_id`) — giống
 * `jobs`/`vocab_items`, đây là cấu hình chung của hệ thống tự lưu trữ. Lịch chạy
 * thực thi bằng BullMQ repeatable job (key suy ra từ `id` + `schedule`).
 */
@Entity({ name: "job_sync_sources" })
export class JobSyncSourceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "varchar", length: 32, default: "vietnamworks" })
  provider!: string;

  /** Danh sách từ khóa tìm kiếm (mỗi lần chạy quét lần lượt từng từ khóa). */
  @Column({ type: "json" })
  queries!: string[];

  /** Bộ lọc địa điểm: `{ cityId, districtIds }`. */
  @Column({ type: "json" })
  filters!: JobSyncFilters;

  @Column({ name: "hits_per_page", type: "int", default: 100 })
  hitsPerPage!: number;

  @Column({ name: "max_pages", type: "int", default: 3 })
  maxPages!: number;

  /** Lịch chạy (discriminated union: interval | daily). */
  @Column({ type: "json" })
  schedule!: JobSyncSchedule;

  @Column({ type: "varchar", length: 64, default: "Asia/Ho_Chi_Minh" })
  timezone!: string;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;

  /** Trạng thái + thời điểm lần chạy gần nhất (cache để hiển thị nhanh). */
  @Column({ name: "last_status", type: "varchar", length: 16, nullable: true })
  lastStatus!: JobSyncRunStatus | null;

  @Column({ name: "last_run_at", type: "datetime", precision: 6, nullable: true })
  lastRunAt!: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
