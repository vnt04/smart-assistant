import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, type ConnectionOptions, type RepeatOptions } from "bullmq";
import type { Env } from "../config/env.validation";
import type { JobSyncSourceEntity } from "./entities/job-sync-source.entity";

export const JOB_SYNC_QUEUE_NAME = "job-sync";
/** Tiền tố id của mọi job scheduler do module này tạo (để reconcile theo prefix). */
const SCHEDULER_PREFIX = "job-sync:";

export interface JobSyncJobData {
  sourceId: string;
}

interface SchedulerSpec {
  id: string;
  repeat: Omit<RepeatOptions, "key">;
}

/**
 * Quản lý lịch chạy bằng BullMQ repeatable jobs (job schedulers). Mỗi nguồn ánh
 * xạ thành 1+ scheduler: `interval` → một scheduler `every`; `daily` → mỗi mốc
 * giờ một scheduler cron (theo timezone của nguồn).
 *
 * Scheduler id có dạng `job-sync:<sourceId>:<suffix>` nên reconcile/xóa theo
 * prefix được. Các thao tác Redis bọc try/catch để Redis chập chờn không làm
 * sập API (chỉ log).
 */
@Injectable()
export class JobSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobSyncScheduler.name);
  private queue?: Queue<JobSyncJobData>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    this.queue = new Queue<JobSyncJobData>(JOB_SYNC_QUEUE_NAME, {
      connection: this.connection(),
      defaultJobOptions: {
        removeOnComplete: { age: 86_400, count: 200 },
        removeOnFail: { age: 7 * 86_400 },
        attempts: 1,
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = undefined;
    }
  }

  connection(): ConnectionOptions {
    return {
      host: this.config.get("REDIS_HOST", { infer: true }),
      port: this.config.get("REDIS_PORT", { infer: true }),
      password: this.config.get("REDIS_PASSWORD", { infer: true }) || undefined,
      maxRetriesPerRequest: null,
    };
  }

  /**
   * Đồng bộ scheduler của MỘT nguồn với cấu hình hiện tại: xóa hết scheduler cũ
   * của nguồn rồi tạo lại theo lịch (nếu đang bật). Gọi sau create/update.
   */
  async syncSource(source: JobSyncSourceEntity): Promise<void> {
    if (!this.queue) return;
    try {
      await this.removeSource(source.id);
      if (!source.enabled) return;
      for (const spec of schedulerSpecs(source)) {
        await this.queue.upsertJobScheduler(spec.id, spec.repeat, {
          name: "sync",
          data: { sourceId: source.id },
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        `Cập nhật lịch nguồn ${source.id} thất bại: ${describe(error)}`,
      );
    }
  }

  /** Xóa toàn bộ scheduler của một nguồn (khi xóa nguồn hoặc trước khi sync lại). */
  async removeSource(sourceId: string): Promise<void> {
    if (!this.queue) return;
    const prefix = `${SCHEDULER_PREFIX}${sourceId}:`;
    try {
      const existing = await this.queue.getJobSchedulers(0, -1);
      for (const sch of existing) {
        if (sch.key.startsWith(prefix)) {
          await this.queue.removeJobScheduler(sch.key);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Xóa lịch nguồn ${sourceId} thất bại: ${describe(error)}`,
      );
    }
  }

  /**
   * Reconcile toàn bộ khi khởi động: tạo scheduler cho nguồn đang bật, xóa
   * scheduler "mồ côi" (nguồn đã xóa/tắt). Bảo đảm Redis khớp DB sau restart.
   */
  async reconcile(sources: JobSyncSourceEntity[]): Promise<void> {
    if (!this.queue) return;
    try {
      const wanted = new Map<string, SchedulerSpec>();
      for (const source of sources) {
        if (!source.enabled) continue;
        for (const spec of schedulerSpecs(source)) wanted.set(spec.id, spec);
      }

      const existing = await this.queue.getJobSchedulers(0, -1);
      for (const sch of existing) {
        if (sch.key.startsWith(SCHEDULER_PREFIX) && !wanted.has(sch.key)) {
          await this.queue.removeJobScheduler(sch.key);
        }
      }

      for (const spec of wanted.values()) {
        const sourceId = sourceIdFromKey(spec.id);
        await this.queue.upsertJobScheduler(spec.id, spec.repeat, {
          name: "sync",
          data: { sourceId },
        });
      }
      this.logger.log(
        `Reconcile lịch sync: ${wanted.size} scheduler cho ${sources.length} nguồn.`,
      );
    } catch (error: unknown) {
      this.logger.error(`Reconcile lịch sync thất bại: ${describe(error)}`);
    }
  }

  /**
   * Map sourceId → thời điểm chạy kế tiếp (ms epoch) lấy từ BullMQ — lấy mốc gần
   * nhất trong các scheduler của nguồn. Redis lỗi → map rỗng (không chặn list).
   */
  async nextRunBySource(): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!this.queue) return map;
    try {
      const existing = await this.queue.getJobSchedulers(0, -1);
      for (const sch of existing) {
        if (!sch.key.startsWith(SCHEDULER_PREFIX) || !sch.next) continue;
        const sourceId = sourceIdFromKey(sch.key);
        const current = map.get(sourceId);
        if (current === undefined || sch.next < current) {
          map.set(sourceId, sch.next);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Lấy nextRun thất bại: ${describe(error)}`);
    }
    return map;
  }
}

/** Danh sách scheduler cần có cho một nguồn (theo lịch của nó). */
function schedulerSpecs(source: JobSyncSourceEntity): SchedulerSpec[] {
  const schedule = source.schedule;
  if (schedule.kind === "interval") {
    return [
      {
        id: `${SCHEDULER_PREFIX}${source.id}:interval`,
        repeat: { every: schedule.everyMinutes * 60_000 },
      },
    ];
  }
  // daily: mỗi mốc giờ một scheduler cron (cùng phút/giờ khác nhau giữa các mốc).
  return schedule.times.map((time) => {
    const [hh, mm] = time.split(":");
    return {
      id: `${SCHEDULER_PREFIX}${source.id}:d_${hh}${mm}`,
      repeat: { pattern: `${Number(mm)} ${Number(hh)} * * *`, tz: source.timezone },
    };
  });
}

/** Lấy sourceId từ scheduler key `job-sync:<sourceId>:<suffix>`. */
function sourceIdFromKey(key: string): string {
  const rest = key.slice(SCHEDULER_PREFIX.length);
  const sep = rest.indexOf(":");
  return sep === -1 ? rest : rest.slice(0, sep);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "lỗi không xác định";
}
