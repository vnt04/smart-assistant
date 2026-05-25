import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import type {
  CreateReminderInput,
  Reminder as ReminderDto,
  ReminderTargetType,
} from "@assistant/shared";
import { ReminderEntity } from "./entities/reminder.entity";
import { RemindersQueue } from "./reminders.queue";

@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(ReminderEntity)
    private readonly repo: Repository<ReminderEntity>,
    private readonly queue: RemindersQueue,
  ) {}

  async listForUser(userId: string): Promise<ReminderDto[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { remindAt: "ASC" },
      take: 200,
    });
    return rows.map(toDto);
  }

  async listForTargets(
    userId: string,
    targetType: ReminderTargetType,
    targetIds: string[],
  ): Promise<ReminderDto[]> {
    if (targetIds.length === 0) return [];
    const rows = await this.repo.find({
      where: { userId, targetType, targetId: In(targetIds) },
      order: { remindAt: "ASC" },
    });
    return rows.map(toDto);
  }

  async create(
    userId: string,
    input: CreateReminderInput,
  ): Promise<ReminderDto> {
    const remindAt = new Date(input.remindAt);
    const entity = this.repo.create({
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
      remindAt,
      sentAt: null,
      jobId: null,
    });
    const saved = await this.repo.save(entity);

    const jobId = await this.queue.schedule({
      reminderId: saved.id,
      userId,
      targetType: input.targetType,
      targetId: input.targetId,
      remindAt,
    });
    if (jobId) {
      saved.jobId = jobId;
      await this.repo.save(saved);
    }
    return toDto(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "reminder_not_found",
        message: "Không tìm thấy reminder",
      });
    }
    if (row.jobId) {
      await this.queue.cancel(row.jobId);
    }
    await this.repo.remove(row);
  }

  async removeByTarget(
    userId: string,
    targetType: ReminderTargetType,
    targetId: string,
  ): Promise<void> {
    const rows = await this.repo.find({
      where: { userId, targetType, targetId },
    });
    for (const r of rows) {
      if (r.jobId) {
        await this.queue.cancel(r.jobId);
      }
    }
    if (rows.length > 0) {
      await this.repo.remove(rows);
    }
  }

  async markSent(reminderId: string): Promise<void> {
    await this.repo.update({ id: reminderId }, { sentAt: new Date() });
  }
}

function toDto(r: ReminderEntity): ReminderDto {
  return {
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    remindAt: r.remindAt.toISOString(),
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}
