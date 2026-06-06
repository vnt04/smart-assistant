import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import type {
  Share,
  ShareLinkAccess,
  ShareResourceType,
  SharedNotePayload,
  SharedNoteSummary,
  SharedResource,
} from "@assistant/shared";
import { UsersService } from "../users/users.service";
import { NoteEntity } from "./entities/note.entity";
import { NoteReferenceEntity } from "./entities/note-reference.entity";
import { NotebookEntity } from "./entities/notebook.entity";
import { ShareEntity } from "./entities/share.entity";
import { ShareInviteEntity } from "./entities/share-invite.entity";
import { NotebooksService } from "./notebooks.service";
import { excerpt } from "./util/html-to-text";

// Số byte ngẫu nhiên cho token link; base64url của 24 byte ≈ 32 ký tự.
const TOKEN_BYTES = 24;
// Số ký tự content_text lấy để dựng excerpt (không kéo cả MEDIUMTEXT về).
const EXCERPT_SOURCE_LEN = 300;

interface NotebookNoteRow {
  id: string;
  title: string;
  notebookId: string | null;
  isLocked: number | boolean;
  updatedAt: Date | string;
  excerptSource: string | null;
}

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(ShareEntity)
    private readonly shares: Repository<ShareEntity>,
    @InjectRepository(ShareInviteEntity)
    private readonly invites: Repository<ShareInviteEntity>,
    @InjectRepository(NoteEntity)
    private readonly notesRepo: Repository<NoteEntity>,
    @InjectRepository(NotebookEntity)
    private readonly notebooksRepo: Repository<NotebookEntity>,
    @InjectRepository(NoteReferenceEntity)
    private readonly refs: Repository<NoteReferenceEntity>,
    private readonly notebooks: NotebooksService,
    private readonly users: UsersService,
  ) {}

  // ---------------- Owner-facing ----------------

  /** Lấy (hoặc tạo lazily) cấu hình chia sẻ cho resource mà user sở hữu. */
  async getOrCreate(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<Share> {
    await this.assertOwnership(userId, resourceType, resourceId);
    const share = await this.findOrCreateEntity(userId, resourceType, resourceId);
    return this.toDto(share);
  }

  /** Bật/tắt link công khai. Bật ("view") bị chặn nếu resource đang khóa. */
  async setLink(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
    linkAccess: ShareLinkAccess,
  ): Promise<Share> {
    await this.assertOwnership(userId, resourceType, resourceId);
    if (linkAccess === "view") {
      await this.assertNotLocked(userId, resourceType, resourceId);
    }
    const share = await this.findOrCreateEntity(userId, resourceType, resourceId);
    share.linkAccess = linkAccess;
    await this.shares.save(share);
    return this.toDto(share);
  }

  /** Mời thêm một email. Bị chặn nếu resource đang khóa. */
  async addInvite(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
    email: string,
  ): Promise<Share> {
    await this.assertOwnership(userId, resourceType, resourceId);
    await this.assertNotLocked(userId, resourceType, resourceId);
    const normalized = email.trim().toLowerCase();
    const share = await this.findOrCreateEntity(userId, resourceType, resourceId);
    const existing = await this.invites.findOne({
      where: { shareId: share.id, email: normalized },
    });
    if (!existing) {
      await this.invites.save(
        this.invites.create({ shareId: share.id, email: normalized }),
      );
    }
    return this.toDto(share);
  }

  /** Gỡ một lời mời (luôn cho phép, kể cả khi resource đang khóa). */
  async removeInvite(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
    inviteId: string,
  ): Promise<Share> {
    await this.assertOwnership(userId, resourceType, resourceId);
    const share = await this.findOrCreateEntity(userId, resourceType, resourceId);
    await this.invites.delete({ id: inviteId, shareId: share.id });
    return this.toDto(share);
  }

  /** Ngừng chia sẻ hoàn toàn (xóa cấu hình + invites qua CASCADE). */
  async stop(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<void> {
    await this.assertOwnership(userId, resourceType, resourceId);
    await this.shares.delete({ ownerUserId: userId, resourceType, resourceId });
  }

  // ---------------- Public-facing (người nhận) ----------------

  /** Resolve token → nội dung note hoặc notebook (kèm danh sách note). */
  async resolve(
    token: string,
    requesterEmail: string | null,
  ): Promise<SharedResource> {
    const share = await this.resolveAccess(token, requesterEmail);
    const ownerName = await this.ownerName(share.ownerUserId);

    if (share.resourceType === "note") {
      const note = await this.loadShareableNote(share.ownerUserId, share.resourceId);
      return this.toSharedNotePayload(ownerName, note);
    }

    const notebook = await this.notebooksRepo.findOne({
      where: { id: share.resourceId, userId: share.ownerUserId },
    });
    if (!notebook || (await this.isNotebookLocked(share.ownerUserId, notebook.id))) {
      throw shareNotFound();
    }
    const notes = await this.listNotebookNotes(share.ownerUserId, notebook.id);
    return {
      resourceType: "notebook",
      ownerName,
      notebook: { id: notebook.id, name: notebook.name },
      notes,
    };
  }

  /** Lấy nội dung một note cụ thể trong phạm vi của token. */
  async resolveNote(
    token: string,
    noteId: string,
    requesterEmail: string | null,
  ): Promise<SharedNotePayload> {
    const share = await this.resolveAccess(token, requesterEmail);

    if (share.resourceType === "note") {
      // Cho phép lần theo liên kết (mention @) từ note gốc: người nhận xem được
      // mọi note REACHABLE bằng cách đi theo cạnh from→to của note_references.
      const reachable = await this.reachableNoteIds(
        share.ownerUserId,
        share.resourceId,
      );
      if (!reachable.has(noteId)) throw shareNotFound();
    } else {
      // Token notebook: note phải nằm trong cây notebook đã share.
      const ids = await this.notebooks.descendantIds(
        share.ownerUserId,
        share.resourceId,
      );
      const meta = await this.notesRepo.findOne({
        where: { id: noteId, userId: share.ownerUserId },
        select: ["id", "notebookId"],
      });
      if (!meta || meta.notebookId == null || !ids.includes(meta.notebookId)) {
        throw shareNotFound();
      }
    }

    const note = await this.loadShareableNote(share.ownerUserId, noteId);
    const ownerName = await this.ownerName(share.ownerUserId);
    return this.toSharedNotePayload(ownerName, note);
  }

  // ---------------- Helpers ----------------

  /**
   * Tập note id xem được khi share MỘT note đơn: note gốc + mọi note lần tới được
   * bằng cách đi theo liên kết (mention) theo chiều from→to, đệ quy. Chỉ theo
   * liên kết ĐI RA (không gồm backlinks) để không lộ note mà chủ không chủ động
   * trỏ tới. BFS có tập `reachable` nên an toàn với chu trình; bị chặn tự nhiên
   * bởi tổng số note của chủ.
   */
  private async reachableNoteIds(
    ownerUserId: string,
    rootNoteId: string,
  ): Promise<Set<string>> {
    const reachable = new Set<string>([rootNoteId]);
    let frontier = [rootNoteId];
    while (frontier.length > 0) {
      const rows = await this.refs.find({
        where: { fromNoteId: In(frontier), userId: ownerUserId },
        select: ["toNoteId"],
      });
      const next: string[] = [];
      for (const row of rows) {
        if (!reachable.has(row.toNoteId)) {
          reachable.add(row.toNoteId);
          next.push(row.toNoteId);
        }
      }
      frontier = next;
    }
    return reachable;
  }

  private async resolveAccess(
    token: string,
    requesterEmail: string | null,
  ): Promise<ShareEntity> {
    if (!token || token.length < 16) throw shareNotFound();
    const share = await this.shares.findOne({ where: { token } });
    if (!share) throw shareNotFound();

    // Link công khai bật → ai cũng xem được.
    if (share.linkAccess === "view") return share;

    // Link tắt → phải là người được mời (đăng nhập đúng email).
    const invites = await this.invites.find({
      where: { shareId: share.id },
      select: ["email"],
    });
    if (invites.length === 0) throw shareNotFound();
    if (!requesterEmail) {
      throw new UnauthorizedException({
        code: "share_login_required",
        message: "Vui lòng đăng nhập bằng email được mời để xem nội dung này",
      });
    }
    const email = requesterEmail.toLowerCase();
    const allowed = invites.some((i) => i.email.toLowerCase() === email);
    if (!allowed) {
      throw new ForbiddenException({
        code: "share_forbidden",
        message: "Email của bạn không có quyền xem nội dung này",
      });
    }
    return share;
  }

  private async assertOwnership(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<void> {
    if (resourceType === "note") {
      const note = await this.notesRepo.findOne({
        where: { id: resourceId, userId },
        select: ["id"],
      });
      if (!note) {
        throw new NotFoundException({
          code: "note_not_found",
          message: "Không tìm thấy ghi chú",
        });
      }
      return;
    }
    const notebook = await this.notebooksRepo.findOne({
      where: { id: resourceId, userId },
      select: ["id"],
    });
    if (!notebook) {
      throw new NotFoundException({
        code: "notebook_not_found",
        message: "Không tìm thấy notebook",
      });
    }
  }

  private async assertNotLocked(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<void> {
    const locked =
      resourceType === "note"
        ? await this.isNoteLockedById(userId, resourceId)
        : await this.isNotebookLocked(userId, resourceId);
    if (locked) {
      throw new BadRequestException({
        code: "share_locked",
        message: "Hãy mở khóa ghi chú/notebook trước khi chia sẻ",
      });
    }
  }

  private async findOrCreateEntity(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<ShareEntity> {
    const existing = await this.shares.findOne({
      where: { ownerUserId: userId, resourceType, resourceId },
    });
    if (existing) return existing;

    const entity = this.shares.create({
      ownerUserId: userId,
      resourceType,
      resourceId,
      token: randomBytes(TOKEN_BYTES).toString("base64url"),
      linkAccess: "none",
    });
    try {
      return await this.shares.save(entity);
    } catch (err) {
      // Xử lý đua tạo trùng (unique resource_type + resource_id): nạp lại bản ghi
      // đã có; nếu vẫn không thấy thì lỗi thật → ném tiếp.
      const again = await this.shares.findOne({
        where: { ownerUserId: userId, resourceType, resourceId },
      });
      if (again) return again;
      throw err;
    }
  }

  private async isNoteLockedById(
    ownerUserId: string,
    noteId: string,
  ): Promise<boolean> {
    const note = await this.notesRepo.findOne({
      where: { id: noteId, userId: ownerUserId },
      select: ["id", "isLocked", "notebookId"],
    });
    if (!note) return false;
    return this.isNoteLocked(ownerUserId, note);
  }

  private async isNoteLocked(
    ownerUserId: string,
    note: Pick<NoteEntity, "isLocked" | "notebookId">,
  ): Promise<boolean> {
    if (note.isLocked) return true;
    if (note.notebookId == null) return false;
    const locked = await this.notebooks.lockedNotebookIds(ownerUserId);
    return locked.has(note.notebookId);
  }

  private async isNotebookLocked(
    ownerUserId: string,
    notebookId: string,
  ): Promise<boolean> {
    const locked = await this.notebooks.lockedNotebookIds(ownerUserId);
    return locked.has(notebookId);
  }

  /** Nạp note đầy đủ để hiển thị công khai; ẩn (404) nếu thiếu hoặc đang khóa. */
  private async loadShareableNote(
    ownerUserId: string,
    noteId: string,
  ): Promise<NoteEntity> {
    const note = await this.notesRepo.findOne({
      where: { id: noteId, userId: ownerUserId },
    });
    if (!note) throw shareNotFound();
    if (await this.isNoteLocked(ownerUserId, note)) throw shareNotFound();
    return note;
  }

  /** Danh sách note (phẳng) trong cây notebook, loại bỏ note đang khóa. */
  private async listNotebookNotes(
    ownerUserId: string,
    notebookId: string,
  ): Promise<SharedNoteSummary[]> {
    const ids = await this.notebooks.descendantIds(ownerUserId, notebookId);
    if (ids.length === 0) return [];
    const lockedNb = await this.notebooks.lockedNotebookIds(ownerUserId);

    const rows = await this.notesRepo
      .createQueryBuilder("n")
      .select("n.id", "id")
      .addSelect("n.title", "title")
      .addSelect("n.notebookId", "notebookId")
      .addSelect("n.isLocked", "isLocked")
      .addSelect("n.updatedAt", "updatedAt")
      .addSelect(`LEFT(n.content_text, ${EXCERPT_SOURCE_LEN})`, "excerptSource")
      .where("n.user_id = :ownerUserId", { ownerUserId })
      .andWhere("n.notebook_id IN (:...ids)", { ids })
      .orderBy("n.is_pinned", "DESC")
      .addOrderBy("n.updated_at", "DESC")
      .getRawMany<NotebookNoteRow>();

    return rows
      .filter(
        (row) =>
          !Boolean(row.isLocked) &&
          (row.notebookId == null || !lockedNb.has(row.notebookId)),
      )
      .map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: excerpt(row.excerptSource ?? ""),
        updatedAt: toIso(row.updatedAt),
      }));
  }

  private async ownerName(ownerUserId: string): Promise<string> {
    const user = await this.users.findById(ownerUserId);
    return user?.name ?? "Người dùng";
  }

  private toSharedNotePayload(
    ownerName: string,
    note: NoteEntity,
  ): SharedNotePayload {
    return {
      resourceType: "note",
      ownerName,
      note: {
        id: note.id,
        title: note.title,
        contentHtml: note.contentHtml,
        updatedAt: note.updatedAt.toISOString(),
      },
    };
  }

  private async toDto(share: ShareEntity): Promise<Share> {
    const invites = await this.invites.find({
      where: { shareId: share.id },
      order: { createdAt: "ASC" },
    });
    return {
      id: share.id,
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      linkAccess: share.linkAccess,
      token: share.token,
      invites: invites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        createdAt: invite.createdAt.toISOString(),
      })),
      createdAt: share.createdAt.toISOString(),
      updatedAt: share.updatedAt.toISOString(),
    };
  }
}

function shareNotFound(): NotFoundException {
  return new NotFoundException({
    code: "share_not_found",
    message: "Liên kết chia sẻ không tồn tại hoặc đã bị thu hồi",
  });
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
