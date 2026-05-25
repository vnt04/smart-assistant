import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, type ConnectionOptions } from "bullmq";
import type { ReminderTargetType } from "@assistant/shared";
import type { Env } from "../config/env.validation";

export const REMINDERS_QUEUE_NAME = "reminders";

export interface ReminderJobData {
  reminderId: string;
  userId: string;
  targetType: ReminderTargetType;
  targetId: string;
  remindAt: string;
}

interface ScheduleArgs {
  reminderId: string;
  userId: string;
  targetType: ReminderTargetType;
  targetId: string;
  remindAt: Date;
}

@Injectable()
export class RemindersQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersQueue.name);
  private queue?: Queue<ReminderJobData>;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    this.queue = new Queue<ReminderJobData>(REMINDERS_QUEUE_NAME, {
      connection: this.connection(),
      defaultJobOptions: {
        removeOnComplete: { age: 86_400, count: 1000 },
        removeOnFail: { age: 7 * 86_400 },
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
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
      password:
        this.config.get("REDIS_PASSWORD", { infer: true }) || undefined,
      maxRetriesPerRequest: null,
    };
  }

  async schedule(args: ScheduleArgs): Promise<string | null> {
    if (!this.queue) return null;
    const delay = Math.max(0, args.remindAt.getTime() - Date.now());
    const jobId = `reminder:${args.reminderId}`;
    try {
      await this.queue.add(
        "send",
        {
          reminderId: args.reminderId,
          userId: args.userId,
          targetType: args.targetType,
          targetId: args.targetId,
          remindAt: args.remindAt.toISOString(),
        },
        { jobId, delay },
      );
      return jobId;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to schedule reminder ${args.reminderId}: ${describe(error)}`,
      );
      return null;
    }
  }

  async cancel(jobId: string): Promise<void> {
    if (!this.queue) return;
    try {
      const job = await this.queue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch (error: unknown) {
      this.logger.warn(`Failed to cancel job ${jobId}: ${describe(error)}`);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
