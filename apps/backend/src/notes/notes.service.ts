import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type {
  CreateNoteInput,
  Note,
  NoteListQuery,
  NoteListResponse,
  NoteSummary,
  Tag,
  UpdateNoteInput,
} from "@assistant/shared";
import { SettingsService } from "../settings/settings.service";
import { NotebooksService } from "./notebooks.service";
import { TagsService } from "./tags.service";
import { AttachmentEntity } from "./entities/attachment.entity";
import { NoteEntity } from "./entities/note.entity";
import { ShareEntity } from "./entities/share.entity";
import { TagEntity } from "./entities/tag.entity";
import { excerpt, htmlToText } from "./util/html-to-text";

const FT_MIN_TOKEN = 2;
// Số ký tự content_text lấy từ DB để dựng excerpt. Phải >= excerpt() max (200)
// cộng dư một ít cho phần trimEnd; KHÔNG kéo cả MEDIUMTEXT về.
const EXCERPT_SOURCE_LEN = 300;

interface NoteSummaryRow {
  id: string;
  notebookId: string | null;
  title: string;
  isPinned: number | boolean;
  isLocked: number | boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  excerptSource: string | null;
}

interface TagRow {
  noteId: string;
  id: string;
  name: string;
  createdAt: Date | string;
}

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(NoteEntity)
    private readonly notes: Repository<NoteEntity>,
    @InjectRepository(ShareEntity)
    private readonly shares: Repository<ShareEntity>,
    private readonly notebooks: NotebooksService,
    private readonly tagsSvc: TagsService,
    private readonly settings: SettingsService,
  ) {}

  async list(
    userId: string,
    query: NoteListQuery,
  ): Promise<NoteListResponse> {
    // Base chỉ chứa filter (user/notebook/tag/pinned/search), chưa join tags
    // và chưa chọn cột — dùng lại cho cả count lẫn query trang.
    const base = this.notes
      .createQueryBuilder("n")
      .where("n.user_id = :userId", { userId });

    if (query.notebookId === "none") {
      base.andWhere("n.notebook_id IS NULL");
    } else if (query.notebookId) {
      if (query.includeChildren) {
        const ids = await this.notebooks.descendantIds(
          userId,
          query.notebookId,
        );
        if (ids.length === 0) {
          base.andWhere("1 = 0");
        } else {
          base.andWhere("n.notebook_id IN (:...nbIds)", { nbIds: ids });
        }
      } else {
        base.andWhere("n.notebook_id = :nbId", { nbId: query.notebookId });
      }
    }

    if (query.tag) {
      base.andWhere((sub) => {
        const subQuery = sub
          .subQuery()
          .select("nt.note_id")
          .from("note_tags", "nt")
          .innerJoin("tags", "t", "t.id = nt.tag_id")
          .where("t.user_id = :userId", { userId })
          .andWhere("t.name = :tagName", { tagName: query.tag })
          .getQuery();
        return `n.id IN ${subQuery}`;
      });
    }

    if (query.pinned !== undefined) {
      base.andWhere("n.is_pinned = :pinned", { pinned: query.pinned ? 1 : 0 });
    }

    if (query.q && query.q.length >= FT_MIN_TOKEN) {
      base.andWhere(
        "(MATCH(n.title, n.content_text) AGAINST (:ftQuery IN BOOLEAN MODE) OR n.title LIKE :likeQuery OR n.content_text LIKE :likeQuery)",
        {
          ftQuery: toBooleanQuery(query.q),
          likeQuery: `%${escapeLike(query.q)}%`,
        },
      );
    } else if (query.q) {
      base.andWhere(
        "(n.title LIKE :likeQuery OR n.content_text LIKE :likeQuery)",
        { likeQuery: `%${escapeLike(query.q)}%` },
      );
    }

    const total = await base.clone().getCount();

    // Chỉ lấy metadata + đoạn đầu của content_text cho excerpt.
    // KHÔNG select content_html / content_text đầy đủ (cả hai là MEDIUMTEXT)
    // để query danh sách không phải kéo blob lớn về backend.
    const rows = await base
      .clone()
      .select("n.id", "id")
      .addSelect("n.notebookId", "notebookId")
      .addSelect("n.title", "title")
      .addSelect("n.isPinned", "isPinned")
      .addSelect("n.isLocked", "isLocked")
      .addSelect("n.createdAt", "createdAt")
      .addSelect("n.updatedAt", "updatedAt")
      .addSelect(`LEFT(n.content_text, ${EXCERPT_SOURCE_LEN})`, "excerptSource")
      .orderBy("n.is_pinned", "DESC")
      .addOrderBy("n.updated_at", "DESC")
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<NoteSummaryRow>();

    const tagsByNote = await this.loadTagsByNote(rows.map((row) => row.id));
    // Khóa hiệu lực = cờ riêng của note HOẶC notebook tổ tiên bị khóa (cascade).
    // Ẩn excerpt cho mọi note bị khóa hiệu lực; tiêu đề vẫn hiển thị.
    const lockedNb = await this.notebooks.lockedNotebookIds(userId);

    const items: NoteSummary[] = rows.map((row) => {
      const effLocked =
        Boolean(row.isLocked) ||
        (row.notebookId != null && lockedNb.has(row.notebookId));
      return {
        id: row.id,
        notebookId: row.notebookId ?? null,
        title: row.title,
        excerpt: effLocked ? "" : excerpt(row.excerptSource ?? ""),
        isPinned: Boolean(row.isPinned),
        isLocked: Boolean(row.isLocked),
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
        tags: tagsByNote.get(row.id) ?? [],
      };
    });

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
    };
  }

  // Load tags cho đúng các note trong trang bằng một query nhẹ (chỉ cột tag),
  // tránh JOIN tags vào query chính (gây nhân dòng + rắc rối phân trang) và
  // tránh đụng tới các cột content lớn của bảng notes.
  private async loadTagsByNote(
    noteIds: string[],
  ): Promise<Map<string, Tag[]>> {
    const byNote = new Map<string, Tag[]>();
    if (noteIds.length === 0) return byNote;

    const rows = await this.notes.manager
      .createQueryBuilder()
      .select("nt.note_id", "noteId")
      .addSelect("t.id", "id")
      .addSelect("t.name", "name")
      .addSelect("t.created_at", "createdAt")
      .from("note_tags", "nt")
      .innerJoin(TagEntity, "t", "t.id = nt.tag_id")
      .where("nt.note_id IN (:...noteIds)", { noteIds })
      .orderBy("t.name", "ASC")
      .getRawMany<TagRow>();

    for (const row of rows) {
      const list = byNote.get(row.noteId) ?? [];
      list.push({ id: row.id, name: row.name, createdAt: toIso(row.createdAt) });
      byNote.set(row.noteId, list);
    }
    return byNote;
  }

  /** Tải DTO đầy đủ (luôn kèm content + attachments), KHÔNG kiểm tra khóa. */
  private async loadFullDto(userId: string, id: string): Promise<Note> {
    const row = await this.notes.findOne({
      where: { id, userId },
      relations: { tags: true, attachments: true },
    });
    if (!row) {
      throw new NotFoundException({
        code: "note_not_found",
        message: "Không tìm thấy ghi chú",
      });
    }
    return toDto(row);
  }

  private async isEffectivelyLocked(
    userId: string,
    note: Pick<Note, "isLocked" | "notebookId">,
  ): Promise<boolean> {
    if (note.isLocked) return true;
    if (note.notebookId == null) return false;
    const lockedNb = await this.notebooks.lockedNotebookIds(userId);
    return lockedNb.has(note.notebookId);
  }

  /**
   * GET công khai: nếu note bị khóa hiệu lực thì che nội dung (content rỗng,
   * attachments rỗng) — frontend sẽ hiện màn nhập mật khẩu rồi gọi reveal().
   */
  async findOne(userId: string, id: string): Promise<Note> {
    const dto = await this.loadFullDto(userId, id);
    if (await this.isEffectivelyLocked(userId, dto)) {
      return { ...dto, contentHtml: "", contentText: "", attachments: [] };
    }
    return dto;
  }

  /** Per-view: xác minh mật khẩu rồi trả nội dung đầy đủ. KHÔNG đổi cờ khóa. */
  async reveal(userId: string, id: string, password: string): Promise<Note> {
    await this.settings.requireNotesLock(userId, password);
    return this.loadFullDto(userId, id);
  }

  async lock(userId: string, id: string): Promise<Note> {
    if (!(await this.settings.hasNotesLock(userId))) {
      throw new BadRequestException({
        code: "notes_lock_not_set",
        message: "Chưa đặt mật khẩu khóa",
      });
    }
    await this.assertOwnership(userId, id);
    await this.notes.update({ id, userId }, { isLocked: true });
    return this.loadFullDto(userId, id);
  }

  async unlock(userId: string, id: string, password: string): Promise<Note> {
    await this.settings.requireNotesLock(userId, password);
    await this.assertOwnership(userId, id);
    await this.notes.update({ id, userId }, { isLocked: false });
    return this.loadFullDto(userId, id);
  }

  async assertOwnership(userId: string, noteId: string): Promise<NoteEntity> {
    const row = await this.notes.findOne({
      where: { id: noteId, userId },
      select: ["id", "userId"],
    });
    if (!row) {
      throw new NotFoundException({
        code: "note_not_found",
        message: "Không tìm thấy ghi chú",
      });
    }
    return row;
  }

  async create(userId: string, input: CreateNoteInput): Promise<Note> {
    if (input.notebookId) {
      await this.notebooks.findOne(userId, input.notebookId);
    }
    const contentHtml = input.contentHtml ?? "";
    const tags = input.tags?.length
      ? await this.tagsSvc.ensureMany(userId, input.tags)
      : [];

    const entity = this.notes.create({
      userId,
      notebookId: input.notebookId ?? null,
      title: input.title,
      contentHtml,
      contentText: htmlToText(contentHtml),
      isPinned: input.isPinned ?? false,
      tags,
    });
    const saved = await this.notes.save(entity);
    // loadFullDto (không che) để người vừa tạo — kể cả trong notebook bị khóa —
    // vẫn nhận đủ nội dung để soạn thảo ngay.
    return this.loadFullDto(userId, saved.id);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateNoteInput,
  ): Promise<Note> {
    const entity = await this.notes.findOne({
      where: { id, userId },
      relations: { tags: true },
    });
    if (!entity) {
      throw new NotFoundException({
        code: "note_not_found",
        message: "Không tìm thấy ghi chú",
      });
    }

    if (input.notebookId !== undefined) {
      if (input.notebookId) {
        await this.notebooks.findOne(userId, input.notebookId);
      }
      entity.notebookId = input.notebookId;
    }
    if (input.title !== undefined) entity.title = input.title;
    if (input.contentHtml !== undefined) {
      entity.contentHtml = input.contentHtml;
      entity.contentText = htmlToText(input.contentHtml);
    }
    if (input.isPinned !== undefined) entity.isPinned = input.isPinned;
    if (input.tags !== undefined) {
      entity.tags = await this.tagsSvc.ensureMany(userId, input.tags);
    }

    await this.notes.save(entity);
    // Trả nội dung đầy đủ (không che): auto-save sau khi reveal không bị mất content.
    return this.loadFullDto(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.notes.findOne({ where: { id, userId } });
    if (!row) {
      throw new NotFoundException({
        code: "note_not_found",
        message: "Không tìm thấy ghi chú",
      });
    }
    await this.notes.remove(row);
    // Dọn cấu hình chia sẻ (bảng shares không có FK tới notes vì là polymorphic).
    await this.shares.delete({
      ownerUserId: userId,
      resourceType: "note",
      resourceId: id,
    });
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function tagToDto(t: TagEntity): Tag {
  return {
    id: t.id,
    name: t.name,
    createdAt: t.createdAt.toISOString(),
  };
}

function toDto(e: NoteEntity): Note {
  return {
    id: e.id,
    notebookId: e.notebookId,
    title: e.title,
    contentHtml: e.contentHtml,
    contentText: e.contentText,
    isPinned: Boolean(e.isPinned),
    isLocked: Boolean(e.isLocked),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    tags: (e.tags ?? []).map(tagToDto),
    attachments: (e.attachments ?? []).map((a: AttachmentEntity) => ({
      id: a.id,
      noteId: a.noteId,
      originalName: a.originalName,
      mime: a.mime,
      sizeBytes: a.sizeBytes,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

function toBooleanQuery(input: string): string {
  return input
    .split(/\s+/)
    .filter((tok) => tok.length >= FT_MIN_TOKEN)
    .map((tok) => `+${tok.replace(/[+\-><()~*"@]/g, "")}*`)
    .join(" ");
}
