import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  CreateNotebookInput,
  Notebook,
  UpdateNotebookInput,
} from "@assistant/shared";
import { SettingsService } from "../settings/settings.service";
import { NotebookEntity } from "./entities/notebook.entity";

@Injectable()
export class NotebooksService {
  constructor(
    @InjectRepository(NotebookEntity)
    private readonly repo: Repository<NotebookEntity>,
    private readonly settings: SettingsService,
  ) {}

  async list(userId: string): Promise<Notebook[]> {
    const rows = await this.repo.find({
      where: { userId },
      order: { name: "ASC" },
    });
    return rows.map(toDto);
  }

  async findOne(userId: string, id: string): Promise<NotebookEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "notebook_not_found",
        message: "Không tìm thấy notebook",
      });
    }
    return row;
  }

  async create(
    userId: string,
    input: CreateNotebookInput,
  ): Promise<Notebook> {
    if (input.parentId) {
      await this.findOne(userId, input.parentId);
    }
    const entity = this.repo.create({
      userId,
      parentId: input.parentId ?? null,
      name: input.name,
      color: input.color ?? null,
    });
    const saved = await this.repo.save(entity);
    return toDto(saved);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateNotebookInput,
  ): Promise<Notebook> {
    const entity = await this.findOne(userId, id);
    if (input.parentId !== undefined) {
      if (input.parentId === id) {
        throw new BadRequestException({
          code: "invalid_parent",
          message: "Notebook không thể là cha của chính nó",
        });
      }
      if (input.parentId) {
        await this.findOne(userId, input.parentId);
        if (await this.wouldCreateCycle(userId, id, input.parentId)) {
          throw new BadRequestException({
            code: "cycle_detected",
            message: "Cấu trúc notebook bị vòng lặp",
          });
        }
      }
      entity.parentId = input.parentId;
    }
    if (input.name !== undefined) entity.name = input.name;
    if (input.color !== undefined) entity.color = input.color;
    const saved = await this.repo.save(entity);
    return toDto(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.findOne(userId, id);
    await this.repo.remove(entity);
  }

  async lock(userId: string, id: string): Promise<Notebook> {
    if (!(await this.settings.hasNotesLock(userId))) {
      throw new BadRequestException({
        code: "notes_lock_not_set",
        message: "Chưa đặt mật khẩu khóa",
      });
    }
    const entity = await this.findOne(userId, id);
    entity.isLocked = true;
    return toDto(await this.repo.save(entity));
  }

  async unlock(
    userId: string,
    id: string,
    password: string,
  ): Promise<Notebook> {
    await this.settings.requireNotesLock(userId, password);
    const entity = await this.findOne(userId, id);
    entity.isLocked = false;
    return toDto(await this.repo.save(entity));
  }

  /**
   * Tập id của các notebook bị khóa HIỆU LỰC (effective): mọi notebook có cờ
   * is_locked riêng, cộng toàn bộ con cháu của chúng (khóa lan xuống / cascade).
   * NotesService dùng tập này để xác định note nào bị che nội dung.
   */
  async lockedNotebookIds(userId: string): Promise<Set<string>> {
    const all = await this.repo.find({
      where: { userId },
      select: ["id", "parentId", "isLocked"],
    });
    const childrenByParent = new Map<string, string[]>();
    for (const row of all) {
      if (!row.parentId) continue;
      const bucket = childrenByParent.get(row.parentId);
      if (bucket) bucket.push(row.id);
      else childrenByParent.set(row.parentId, [row.id]);
    }
    const locked = new Set<string>();
    const stack = all.filter((r) => r.isLocked).map((r) => r.id);
    while (stack.length) {
      const id = stack.pop() as string;
      if (locked.has(id)) continue;
      locked.add(id);
      const kids = childrenByParent.get(id);
      if (kids) stack.push(...kids);
    }
    return locked;
  }

  /** Returns the notebook id plus every transitive descendant id. */
  async descendantIds(userId: string, rootId: string): Promise<string[]> {
    const all = await this.repo.find({
      where: { userId },
      select: ["id", "parentId"],
    });
    const childrenByParent = new Map<string, string[]>();
    for (const row of all) {
      if (!row.parentId) continue;
      const bucket = childrenByParent.get(row.parentId);
      if (bucket) bucket.push(row.id);
      else childrenByParent.set(row.parentId, [row.id]);
    }
    const result: string[] = [];
    const stack: string[] = [rootId];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      const kids = childrenByParent.get(id);
      if (kids) stack.push(...kids);
    }
    return result;
  }

  private async wouldCreateCycle(
    userId: string,
    movingId: string,
    candidateParentId: string,
  ): Promise<boolean> {
    let cursor: string | null = candidateParentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === movingId) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      const parent: NotebookEntity | null = await this.repo.findOne({
        where: { id: cursor, userId },
        select: ["id", "parentId"],
      });
      cursor = parent?.parentId ?? null;
    }
    return false;
  }
}

function toDto(e: NotebookEntity): Notebook {
  return {
    id: e.id,
    parentId: e.parentId,
    name: e.name,
    color: e.color,
    isLocked: Boolean(e.isLocked),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
