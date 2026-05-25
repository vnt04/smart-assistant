import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import type { CreateTagInput, Tag } from "@assistant/shared";
import { TagEntity } from "./entities/tag.entity";

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(TagEntity)
    private readonly repo: Repository<TagEntity>,
  ) {}

  async list(userId: string): Promise<Tag[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { name: "ASC" },
    });
    return rows.map(toDto);
  }

  async create(userId: string, input: CreateTagInput): Promise<Tag> {
    const name = input.name.trim();
    const existing = await this.repo.findOne({ where: { userId, name } });
    if (existing) return toDto(existing);
    const saved = await this.repo.save(this.repo.create({ userId, name }));
    return toDto(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const tag = await this.repo.findOne({ where: { id, userId } });
    if (!tag) {
      throw new NotFoundException({
        code: "tag_not_found",
        message: "Không tìm thấy tag",
      });
    }
    await this.repo.remove(tag);
  }

  async ensureMany(userId: string, names: string[]): Promise<TagEntity[]> {
    const normalized = Array.from(
      new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
    );
    if (normalized.length === 0) return [];

    const existing = await this.repo.find({
      where: { userId, name: In(normalized) },
    });
    const existingByName = new Map(existing.map((t) => [t.name, t]));

    const missing = normalized.filter((n) => !existingByName.has(n));
    if (missing.length > 0) {
      const created = await this.repo.save(
        missing.map((name) => this.repo.create({ userId, name })),
      );
      for (const t of created) existingByName.set(t.name, t);
    }

    return normalized
      .map((n) => existingByName.get(n))
      .filter((t): t is TagEntity => Boolean(t));
  }
}

function toDto(e: TagEntity): Tag {
  return {
    id: e.id,
    name: e.name,
    createdAt: e.createdAt.toISOString(),
  };
}
