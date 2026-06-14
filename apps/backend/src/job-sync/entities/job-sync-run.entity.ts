import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { JobSyncRunStatus, JobSyncTrigger } from "@assistant/shared";

/**
 * Lịch sử một lần chạy sync. `source_id` để FK SET NULL khi nguồn bị xóa nên
 * lịch sử vẫn còn (kèm `source_name` snapshot để hiển thị). Index theo
 * `started_at` cho việc liệt kê mới-nhất-trước.
 */
@Entity({ name: "job_sync_runs" })
@Index("idx_job_sync_runs_started_at", ["startedAt"])
export class JobSyncRunEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "source_id", type: "char", length: 36, nullable: true })
  sourceId!: string | null;

  @Column({ name: "source_name", type: "varchar", length: 120 })
  sourceName!: string;

  @Column({ type: "varchar", length: 16 })
  trigger!: JobSyncTrigger;

  @Column({ type: "varchar", length: 16 })
  status!: JobSyncRunStatus;

  @Column({ name: "started_at", type: "datetime", precision: 6 })
  startedAt!: Date;

  @Column({ name: "finished_at", type: "datetime", precision: 6, nullable: true })
  finishedAt!: Date | null;

  @Column({ name: "duration_ms", type: "int", unsigned: true, nullable: true })
  durationMs!: number | null;

  @Column({ name: "pages_fetched", type: "int", unsigned: true, default: 0 })
  pagesFetched!: number;

  @Column({ name: "jobs_found", type: "int", unsigned: true, default: 0 })
  jobsFound!: number;

  @Column({ name: "jobs_created", type: "int", unsigned: true, default: 0 })
  jobsCreated!: number;

  @Column({ name: "jobs_updated", type: "int", unsigned: true, default: 0 })
  jobsUpdated!: number;

  @Column({ name: "jobs_failed", type: "int", unsigned: true, default: 0 })
  jobsFailed!: number;

  /** Các từ khóa đã quét trong lần chạy này. */
  @Column({ name: "queries_run", type: "json" })
  queriesRun!: string[];

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
