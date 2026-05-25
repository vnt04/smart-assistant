import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  CreateTaskInput,
  Task as TaskDto,
  TaskListQuery,
  UpdateTaskInput,
} from "@assistant/shared";
import { TaskEntity } from "./entities/task.entity";
import { RemindersService } from "./reminders.service";

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly repo: Repository<TaskEntity>,
    private readonly reminders: RemindersService,
  ) {}

  async list(userId: string, query: TaskListQuery): Promise<TaskDto[]> {
    const qb = this.repo
      .createQueryBuilder("t")
      .where("t.user_id = :userId", { userId });

    if (query.status) {
      qb.andWhere("t.status = :status", { status: query.status });
    }
    if (query.priority) {
      qb.andWhere("t.priority = :priority", { priority: query.priority });
    }

    qb.orderBy("FIELD(t.status, 'doing','todo','done')", "ASC")
      .addOrderBy("FIELD(t.priority, 'urgent','high','medium','low')", "ASC")
      .addOrderBy("t.deadline IS NULL", "ASC")
      .addOrderBy("t.deadline", "ASC")
      .addOrderBy("t.created_at", "DESC")
      .limit(500);

    const rows = await qb.getMany();
    return rows.map(toDto);
  }

  async findOne(userId: string, id: string): Promise<TaskDto> {
    return toDto(await this.findEntity(userId, id));
  }

  async create(userId: string, input: CreateTaskInput): Promise<TaskDto> {
    const status = input.status ?? "todo";
    const entity = this.repo.create({
      userId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "medium",
      status,
      deadline: input.deadline ? new Date(input.deadline) : null,
      completedAt: status === "done" ? new Date() : null,
    });
    const saved = await this.repo.save(entity);
    if (input.remindAt) {
      await this.reminders.create(userId, {
        targetType: "task",
        targetId: saved.id,
        remindAt: input.remindAt,
      });
    }
    return toDto(saved);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTaskInput,
  ): Promise<TaskDto> {
    const entity = await this.findEntity(userId, id);

    if (input.title !== undefined) entity.title = input.title;
    if (input.description !== undefined) entity.description = input.description;
    if (input.priority !== undefined) entity.priority = input.priority;
    if (input.deadline !== undefined) {
      entity.deadline = input.deadline ? new Date(input.deadline) : null;
    }
    if (input.status !== undefined && input.status !== entity.status) {
      entity.status = input.status;
      if (input.status === "done") {
        entity.completedAt = entity.completedAt ?? new Date();
      } else {
        entity.completedAt = null;
      }
    }

    await this.repo.save(entity);
    return toDto(entity);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.findEntity(userId, id);
    await this.reminders.removeByTarget(userId, "task", id);
    await this.repo.remove(entity);
  }

  async findTitleById(
    userId: string,
    id: string,
  ): Promise<{ title: string; deadline: Date | null } | null> {
    const row = await this.repo.findOne({
      where: { id, userId },
      select: ["title", "deadline"],
    });
    return row ? { title: row.title, deadline: row.deadline } : null;
  }

  private async findEntity(userId: string, id: string): Promise<TaskEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "task_not_found",
        message: "Không tìm thấy task",
      });
    }
    return row;
  }
}

function toDto(t: TaskEntity): TaskDto {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
