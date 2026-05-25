import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import {
  REMINDERS_QUEUE_NAME,
  RemindersQueue,
  type ReminderJobData,
} from "./reminders.queue";
import { EventsService } from "./events.service";
import { TasksService } from "./tasks.service";
import { RemindersService } from "./reminders.service";
import { TelegramService } from "./telegram.service";

@Injectable()
export class RemindersWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersWorker.name);
  private worker?: Worker<ReminderJobData>;

  constructor(
    private readonly queue: RemindersQueue,
    private readonly telegram: TelegramService,
    @Inject(forwardRef(() => EventsService))
    private readonly events: EventsService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasks: TasksService,
    @Inject(forwardRef(() => RemindersService))
    private readonly reminders: RemindersService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<ReminderJobData>(
      REMINDERS_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: this.queue.connection(),
        concurrency: 4,
      },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(
        `Reminder job ${job?.id ?? "unknown"} failed: ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
  }

  private async process(job: Job<ReminderJobData>): Promise<void> {
    const { reminderId, userId, targetType, targetId } = job.data;
    const text = await this.composeMessage(userId, targetType, targetId);
    if (!text) {
      this.logger.warn(
        `Reminder ${reminderId} target missing — skipping send`,
      );
      await this.reminders.markSent(reminderId);
      return;
    }
    await this.telegram.sendMessage(userId, text);
    await this.reminders.markSent(reminderId);
  }

  private async composeMessage(
    userId: string,
    targetType: "event" | "task",
    targetId: string,
  ): Promise<string | null> {
    if (targetType === "event") {
      const row = await this.events.findTitleById(userId, targetId);
      if (!row) return null;
      return `📅 <b>Sự kiện:</b> ${escapeHtml(row.title)}\n⏰ ${formatVN(row.startAt)}`;
    }
    const row = await this.tasks.findTitleById(userId, targetId);
    if (!row) return null;
    const deadline = row.deadline
      ? `\n⏰ Hạn: ${formatVN(row.deadline)}`
      : "";
    return `✅ <b>Task:</b> ${escapeHtml(row.title)}${deadline}`;
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatVN(date: Date): string {
  return date.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
