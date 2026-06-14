import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import {
  JOB_SYNC_QUEUE_NAME,
  JobSyncScheduler,
  type JobSyncJobData,
} from "./job-sync.scheduler";
import { JobSyncService } from "./job-sync.service";

/**
 * Worker xử lý job do scheduler kích hoạt: nạp nguồn theo `sourceId` rồi chạy
 * sync. Concurrency thấp để không gọi VietnamWorks ồ ạt. Lỗi trong run đã được
 * service nuốt + ghi lịch sử, nên worker hiếm khi "failed".
 */
@Injectable()
export class JobSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobSyncWorker.name);
  private worker?: Worker<JobSyncJobData>;

  constructor(
    private readonly scheduler: JobSyncScheduler,
    private readonly service: JobSyncService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<JobSyncJobData>(
      JOB_SYNC_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: this.scheduler.connection(),
        concurrency: 2,
      },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(
        `Job sync ${job?.id ?? "unknown"} failed: ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
  }

  private async process(job: Job<JobSyncJobData>): Promise<void> {
    const sourceId = job.data?.sourceId;
    if (!sourceId) return;
    await this.service.runScheduled(sourceId);
  }
}
