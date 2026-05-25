import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  CreateEventInput,
  Event as EventDto,
  EventListQuery,
  UpdateEventInput,
} from "@assistant/shared";
import { EventEntity } from "./entities/event.entity";
import { RemindersService } from "./reminders.service";

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly repo: Repository<EventEntity>,
    private readonly reminders: RemindersService,
  ) {}

  async list(userId: string, query: EventListQuery): Promise<EventDto[]> {
    const qb = this.repo
      .createQueryBuilder("e")
      .where("e.user_id = :userId", { userId });

    if (query.from) {
      qb.andWhere("e.end_at >= :from", { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere("e.start_at <= :to", { to: new Date(query.to) });
    }
    qb.orderBy("e.start_at", "ASC").limit(500);

    const rows = await qb.getMany();
    return rows.map(toDto);
  }

  async findOne(userId: string, id: string): Promise<EventDto> {
    return toDto(await this.findEntity(userId, id));
  }

  async create(userId: string, input: CreateEventInput): Promise<EventDto> {
    const entity = this.repo.create({
      userId,
      title: input.title,
      description: input.description ?? null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      allDay: input.allDay ?? false,
      location: input.location ?? null,
    });
    const saved = await this.repo.save(entity);
    if (input.remindAt) {
      await this.reminders.create(userId, {
        targetType: "event",
        targetId: saved.id,
        remindAt: input.remindAt,
      });
    }
    return toDto(saved);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateEventInput,
  ): Promise<EventDto> {
    const entity = await this.findEntity(userId, id);

    if (input.title !== undefined) entity.title = input.title;
    if (input.description !== undefined) entity.description = input.description;
    if (input.startAt !== undefined) entity.startAt = new Date(input.startAt);
    if (input.endAt !== undefined) entity.endAt = new Date(input.endAt);
    if (input.allDay !== undefined) entity.allDay = input.allDay;
    if (input.location !== undefined) entity.location = input.location;

    await this.repo.save(entity);
    return toDto(entity);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.findEntity(userId, id);
    await this.reminders.removeByTarget(userId, "event", id);
    await this.repo.remove(entity);
  }

  async findTitleById(
    userId: string,
    id: string,
  ): Promise<{ title: string; startAt: Date } | null> {
    const row = await this.repo.findOne({
      where: { id, userId },
      select: ["title", "startAt"],
    });
    return row ? { title: row.title, startAt: row.startAt } : null;
  }

  private async findEntity(userId: string, id: string): Promise<EventEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "event_not_found",
        message: "Không tìm thấy sự kiện",
      });
    }
    return row;
  }
}

function toDto(e: EventEntity): EventDto {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    allDay: Boolean(e.allDay),
    location: e.location,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
