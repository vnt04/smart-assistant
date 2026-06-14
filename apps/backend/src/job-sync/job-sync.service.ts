import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { MoreThan, Repository } from "typeorm";
import {
  type CreateJobSyncSourceInput,
  type JobSyncOverview,
  type JobSyncRun,
  type JobSyncRunStatus,
  type JobSyncSource,
  type JobSyncTrigger,
  type UpdateJobSyncSourceInput,
} from "@assistant/shared";
import { JobsService } from "../jobs/jobs.service";
import { JobSyncSourceEntity } from "./entities/job-sync-source.entity";
import { JobSyncRunEntity } from "./entities/job-sync-run.entity";
import { JobSyncScheduler } from "./job-sync.scheduler";
import { VietnamworksClient } from "./vietnamworks.client";
import { mapVietnamworksJob } from "./vietnamworks.mapper";

/** Nghỉ giữa các request trang để lịch sự với VietnamWorks. */
const PAGE_DELAY_MS = 400;
/** Số run gần đây trả về trong overview (drawer + badge). */
const RECENT_RUNS_LIMIT = 50;
/** Cửa sổ tính badge "lỗi gần đây" và dọn run treo. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Run "running" cũ hơn mốc này coi như treo → cho phép chạy lại. */
const STALE_RUNNING_MS = 30 * 60 * 1000;

interface RunOutcome {
  status: JobSyncRunStatus;
  pagesFetched: number;
  jobsFound: number;
  jobsCreated: number;
  jobsUpdated: number;
  jobsFailed: number;
  errorMessage: string | null;
}

@Injectable()
export class JobSyncService implements OnModuleInit {
  private readonly logger = new Logger(JobSyncService.name);

  constructor(
    @InjectRepository(JobSyncSourceEntity)
    private readonly sources: Repository<JobSyncSourceEntity>,
    @InjectRepository(JobSyncRunEntity)
    private readonly runs: Repository<JobSyncRunEntity>,
    private readonly jobs: JobsService,
    private readonly client: VietnamworksClient,
    private readonly scheduler: JobSyncScheduler,
  ) {}

  /** Khớp scheduler trong Redis với cấu hình DB khi khởi động (sau restart). */
  async onModuleInit(): Promise<void> {
    try {
      const all = await this.sources.find();
      await this.scheduler.reconcile(all);
    } catch (error: unknown) {
      this.logger.error(`Khởi tạo lịch sync thất bại: ${describe(error)}`);
    }
  }

  /* -------------------- CRUD nguồn -------------------- */

  async listSources(): Promise<JobSyncSource[]> {
    const [entities, nextRunMap] = await Promise.all([
      this.sources.find({ order: { createdAt: "DESC" } }),
      this.scheduler.nextRunBySource(),
    ]);
    return entities.map((e) => toSourceDto(e, nextRunMap.get(e.id) ?? null));
  }

  async createSource(input: CreateJobSyncSourceInput): Promise<JobSyncSource> {
    const entity = this.sources.create({
      name: input.name,
      provider: input.provider,
      queries: input.queries,
      filters: input.filters,
      hitsPerPage: input.hitsPerPage,
      maxPages: input.maxPages,
      schedule: input.schedule,
      enabled: input.enabled,
      lastStatus: null,
      lastRunAt: null,
    });
    const saved = await this.sources.save(entity);
    await this.scheduler.syncSource(saved);
    return this.toSourceDtoLive(saved);
  }

  async updateSource(
    id: string,
    input: UpdateJobSyncSourceInput,
  ): Promise<JobSyncSource> {
    const entity = await this.requireSource(id);

    if (input.name !== undefined) entity.name = input.name;
    if (input.queries !== undefined) entity.queries = input.queries;
    if (input.filters !== undefined) entity.filters = input.filters;
    if (input.hitsPerPage !== undefined) entity.hitsPerPage = input.hitsPerPage;
    if (input.maxPages !== undefined) entity.maxPages = input.maxPages;
    if (input.schedule !== undefined) entity.schedule = input.schedule;
    if (input.enabled !== undefined) entity.enabled = input.enabled;

    const saved = await this.sources.save(entity);
    await this.scheduler.syncSource(saved);
    return this.toSourceDtoLive(saved);
  }

  async deleteSource(id: string): Promise<void> {
    const entity = await this.requireSource(id);
    await this.scheduler.removeSource(entity.id);
    // Lịch sử run vẫn giữ (FK SET NULL); chỉ xóa nguồn.
    await this.sources.delete({ id: entity.id });
  }

  /* -------------------- Lịch sử + tổng quan -------------------- */

  async listRuns(limit: number, sourceId?: string): Promise<JobSyncRun[]> {
    const entities = await this.runs.find({
      where: sourceId ? { sourceId } : {},
      order: { startedAt: "DESC" },
      take: clampLimit(limit),
    });
    return entities.map(toRunDto);
  }

  async getOverview(): Promise<JobSyncOverview> {
    const since = new Date(Date.now() - RECENT_WINDOW_MS);
    const [sources, recentRuns, failedRuns, runningRuns] = await Promise.all([
      this.listSources(),
      this.listRuns(RECENT_RUNS_LIMIT),
      this.runs.count({ where: { status: "error", startedAt: MoreThan(since) } }),
      this.runs.count({ where: { status: "running" } }),
    ]);
    return { sources, recentRuns, failedRuns, runningRuns };
  }

  /* -------------------- Chạy sync -------------------- */

  /** Người dùng bấm "Chạy ngay": tạo run rồi chạy nền, trả run ngay lập tức. */
  async runNow(id: string): Promise<JobSyncRun> {
    const source = await this.requireSource(id);
    await this.assertNotAlreadyRunning(source.id);
    const run = await this.startRun(source, "manual");
    // Chạy nền trong tiến trình API (cùng process với worker). Lỗi chỉ log.
    void this.executeRun(source, run).catch((error: unknown) =>
      this.logger.error(`Run thủ công ${run.id} lỗi: ${describe(error)}`),
    );
    return toRunDto(run);
  }

  /** Worker gọi khi scheduler kích hoạt; bỏ qua nếu nguồn đã xóa/tắt/đang chạy. */
  async runScheduled(sourceId: string): Promise<void> {
    const source = await this.sources.findOne({ where: { id: sourceId } });
    if (!source || !source.enabled) return;
    if (await this.isAlreadyRunning(source.id)) {
      this.logger.warn(`Nguồn ${source.id} đang chạy — bỏ qua lần kích hoạt này.`);
      return;
    }
    const run = await this.startRun(source, "schedule");
    await this.executeRun(source, run);
  }

  /** Tạo bản ghi run trạng thái "running". */
  private async startRun(
    source: JobSyncSourceEntity,
    trigger: JobSyncTrigger,
  ): Promise<JobSyncRunEntity> {
    const run = this.runs.create({
      sourceId: source.id,
      sourceName: source.name,
      trigger,
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      durationMs: null,
      pagesFetched: 0,
      jobsFound: 0,
      jobsCreated: 0,
      jobsUpdated: 0,
      jobsFailed: 0,
      queriesRun: source.queries,
      errorMessage: null,
    });
    return this.runs.save(run);
  }

  /**
   * Quét lần lượt từng từ khóa → từng trang, map mỗi job rồi ingest (upsert).
   * Đếm created/updated/failed; lỗi cả một từ khóa được ghi nhận nhưng không
   * làm hỏng cả run (các từ khóa khác vẫn chạy). Luôn finalize bản ghi run.
   */
  async executeRun(
    source: JobSyncSourceEntity,
    run: JobSyncRunEntity,
  ): Promise<void> {
    const seen = new Set<string>();
    let pagesFetched = 0;
    let jobsFound = 0;
    let jobsCreated = 0;
    let jobsUpdated = 0;
    let jobsFailed = 0;
    let firstError: string | null = null;

    try {
      for (const query of source.queries) {
        try {
          let totalPages = source.maxPages;
          for (let page = 0; page < Math.min(source.maxPages, totalPages); page++) {
            const result = await this.client.search({
              query,
              filters: source.filters,
              hitsPerPage: source.hitsPerPage,
              page,
            });
            pagesFetched += 1;
            if (page === 0) {
              totalPages = Math.max(1, Math.min(source.maxPages, result.nbPages || 1));
            }

            for (const rawItem of result.items) {
              const mapped = mapVietnamworksJob(rawItem);
              if (!mapped) {
                jobsFailed += 1;
                continue;
              }
              const jobId = String(mapped.jobId);
              if (!seen.has(jobId)) {
                seen.add(jobId);
                jobsFound += 1;
              }
              try {
                const res = await this.jobs.ingest(mapped);
                if (res.status === "created") jobsCreated += 1;
                else jobsUpdated += 1;
              } catch (error: unknown) {
                jobsFailed += 1;
                this.logger.warn(`Ingest job lỗi: ${describe(error)}`);
              }
            }

            if (result.items.length === 0) break; // hết dữ liệu
            await delay(PAGE_DELAY_MS);
          }
        } catch (error: unknown) {
          firstError ??= describe(error);
          this.logger.warn(`Sync từ khóa "${query}" lỗi: ${describe(error)}`);
        }
      }

      const status = resolveStatus(firstError, jobsCreated + jobsUpdated, jobsFailed);
      await this.finalize(source, run, {
        status,
        pagesFetched,
        jobsFound,
        jobsCreated,
        jobsUpdated,
        jobsFailed,
        errorMessage: firstError,
      });
    } catch (error: unknown) {
      await this.finalize(source, run, {
        status: "error",
        pagesFetched,
        jobsFound,
        jobsCreated,
        jobsUpdated,
        jobsFailed,
        errorMessage: describe(error),
      });
    }
  }

  /** Ghi kết quả vào run + cập nhật trạng thái-gần-nhất của nguồn. */
  private async finalize(
    source: JobSyncSourceEntity,
    run: JobSyncRunEntity,
    outcome: RunOutcome,
  ): Promise<void> {
    const finishedAt = new Date();
    run.finishedAt = finishedAt;
    run.durationMs = Math.max(0, finishedAt.getTime() - run.startedAt.getTime());
    run.status = outcome.status;
    run.pagesFetched = outcome.pagesFetched;
    run.jobsFound = outcome.jobsFound;
    run.jobsCreated = outcome.jobsCreated;
    run.jobsUpdated = outcome.jobsUpdated;
    run.jobsFailed = outcome.jobsFailed;
    run.errorMessage = outcome.errorMessage;
    // Cập nhật theo cột (KHÔNG ghi lại source_id) — nếu nguồn bị xóa giữa lúc
    // chạy, FK đã SET NULL cột này; `save(run)` sẽ ghi đè bằng id cũ → vi phạm FK
    // và để run kẹt ở "running". `update` chỉ đụng các cột kết quả.
    await this.runs.update(
      { id: run.id },
      {
        finishedAt,
        durationMs: run.durationMs,
        status: run.status,
        pagesFetched: run.pagesFetched,
        jobsFound: run.jobsFound,
        jobsCreated: run.jobsCreated,
        jobsUpdated: run.jobsUpdated,
        jobsFailed: run.jobsFailed,
        errorMessage: run.errorMessage,
      },
    );

    // Cập nhật cache trạng thái trên nguồn (không đụng nếu nguồn vừa bị xóa).
    await this.sources.update(
      { id: source.id },
      { lastStatus: outcome.status, lastRunAt: finishedAt },
    );
  }

  /* -------------------- Helpers -------------------- */

  private async requireSource(id: string): Promise<JobSyncSourceEntity> {
    const entity = await this.sources.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException({
        code: "job_sync_source_not_found",
        message: "Không tìm thấy nguồn đồng bộ",
      });
    }
    return entity;
  }

  private async isAlreadyRunning(sourceId: string): Promise<boolean> {
    const fresh = new Date(Date.now() - STALE_RUNNING_MS);
    const count = await this.runs.count({
      where: { sourceId, status: "running", startedAt: MoreThan(fresh) },
    });
    return count > 0;
  }

  private async assertNotAlreadyRunning(sourceId: string): Promise<void> {
    if (await this.isAlreadyRunning(sourceId)) {
      throw new ConflictException({
        code: "job_sync_already_running",
        message: "Nguồn này đang chạy đồng bộ. Vui lòng đợi lần chạy hiện tại xong.",
      });
    }
  }

  private async toSourceDtoLive(
    entity: JobSyncSourceEntity,
  ): Promise<JobSyncSource> {
    const nextRunMap = await this.scheduler.nextRunBySource();
    return toSourceDto(entity, nextRunMap.get(entity.id) ?? null);
  }
}

function resolveStatus(
  firstError: string | null,
  ingested: number,
  failed: number,
): JobSyncRunStatus {
  if (firstError) return ingested > 0 ? "partial" : "error";
  if (failed > 0) return "partial";
  return "success";
}

function toSourceDto(
  entity: JobSyncSourceEntity,
  nextRunMs: number | null,
): JobSyncSource {
  return {
    id: entity.id,
    name: entity.name,
    provider: "vietnamworks",
    queries: entity.queries ?? [],
    filters: entity.filters,
    hitsPerPage: entity.hitsPerPage,
    maxPages: entity.maxPages,
    schedule: entity.schedule,
    timezone: entity.timezone,
    enabled: entity.enabled,
    lastStatus: entity.lastStatus,
    lastRunAt: entity.lastRunAt ? entity.lastRunAt.toISOString() : null,
    nextRunAt:
      entity.enabled && nextRunMs ? new Date(nextRunMs).toISOString() : null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

function toRunDto(entity: JobSyncRunEntity): JobSyncRun {
  return {
    id: entity.id,
    sourceId: entity.sourceId,
    sourceName: entity.sourceName,
    trigger: entity.trigger,
    status: entity.status,
    startedAt: entity.startedAt.toISOString(),
    finishedAt: entity.finishedAt ? entity.finishedAt.toISOString() : null,
    durationMs: entity.durationMs,
    pagesFetched: entity.pagesFetched,
    jobsFound: entity.jobsFound,
    jobsCreated: entity.jobsCreated,
    jobsUpdated: entity.jobsUpdated,
    jobsFailed: entity.jobsFailed,
    queriesRun: entity.queriesRun ?? [],
    errorMessage: entity.errorMessage,
  };
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return RECENT_RUNS_LIMIT;
  return Math.min(Math.floor(limit), 200);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "lỗi không xác định";
}
