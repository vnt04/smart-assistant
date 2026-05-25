import { promises as fs } from "node:fs";
import { extname, join, normalize, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { Attachment } from "@assistant/shared";
import type { Env } from "../config/env.validation";
import { NotesService } from "./notes.service";
import { AttachmentEntity } from "./entities/attachment.entity";

const ALLOWED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "text/plain",
  "text/markdown",
]);

export interface UploadFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class AttachmentsService {
  private readonly uploadDir: string;
  private readonly maxBytes: number;

  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly repo: Repository<AttachmentEntity>,
    private readonly notes: NotesService,
    config: ConfigService<Env, true>,
  ) {
    this.uploadDir = normalize(
      config.get("UPLOAD_DIR", { infer: true }) ?? "/data/uploads",
    );
    const maxMb = Number(config.get("UPLOAD_MAX_MB", { infer: true }) ?? 20);
    this.maxBytes = maxMb * 1024 * 1024;
  }

  getMaxBytes(): number {
    return this.maxBytes;
  }

  async listForNote(userId: string, noteId: string): Promise<Attachment[]> {
    await this.notes.assertOwnership(userId, noteId);
    const rows = await this.repo.find({
      where: { noteId, userId },
      order: { createdAt: "ASC" },
    });
    return rows.map(toDto);
  }

  async upload(
    userId: string,
    noteId: string,
    file: UploadFile,
  ): Promise<Attachment> {
    if (!file || !file.buffer || file.size === 0) {
      throw new BadRequestException({
        code: "no_file",
        message: "Không có file nào được upload",
      });
    }
    if (file.size > this.maxBytes) {
      throw new BadRequestException({
        code: "file_too_large",
        message: `File vượt quá giới hạn ${Math.round(this.maxBytes / 1024 / 1024)}MB`,
      });
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException({
        code: "mime_not_allowed",
        message: `Định dạng ${file.mimetype} không được hỗ trợ`,
      });
    }

    await this.notes.assertOwnership(userId, noteId);

    const now = new Date();
    const yyyy = now.getUTCFullYear().toString();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ext = sanitizeExt(extname(file.originalname));
    const filename = `${randomUUID()}${ext}`;
    const relPath = join(userId, `${yyyy}${mm}`, filename);
    const absPath = join(this.uploadDir, relPath);

    await fs.mkdir(join(this.uploadDir, userId, `${yyyy}${mm}`), {
      recursive: true,
    });
    await fs.writeFile(absPath, file.buffer);

    const entity = this.repo.create({
      noteId,
      userId,
      originalName: file.originalname.slice(0, 255),
      storedPath: relPath,
      mime: file.mimetype,
      sizeBytes: file.size,
    });
    const saved = await this.repo.save(entity);
    return toDto(saved);
  }

  async openStream(
    userId: string,
    id: string,
  ): Promise<{ absPath: string; entity: AttachmentEntity }> {
    const entity = await this.repo.findOne({ where: { id, userId } });
    if (!entity) {
      throw new NotFoundException({
        code: "attachment_not_found",
        message: "Không tìm thấy file đính kèm",
      });
    }
    const absPath = this.safeJoin(entity.storedPath);
    try {
      await fs.access(absPath);
    } catch {
      throw new NotFoundException({
        code: "attachment_missing_on_disk",
        message: "File đính kèm không tồn tại trên đĩa",
      });
    }
    return { absPath, entity };
  }

  async remove(userId: string, id: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { id, userId } });
    if (!entity) {
      throw new NotFoundException({
        code: "attachment_not_found",
        message: "Không tìm thấy file đính kèm",
      });
    }
    const absPath = this.safeJoin(entity.storedPath);
    await this.repo.remove(entity);
    try {
      await fs.unlink(absPath);
    } catch {
      // file đã không còn — bỏ qua
    }
  }

  private safeJoin(relPath: string): string {
    const candidate = normalize(join(this.uploadDir, relPath));
    const rel = relative(this.uploadDir, candidate);
    if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
      throw new BadRequestException({
        code: "invalid_path",
        message: "Đường dẫn file không hợp lệ",
      });
    }
    return candidate;
  }
}

function sanitizeExt(ext: string): string {
  if (!ext) return "";
  const cleaned = ext.replace(/[^A-Za-z0-9.]/g, "");
  return cleaned.length <= 10 ? cleaned.toLowerCase() : "";
}

function toDto(a: AttachmentEntity): Attachment {
  return {
    id: a.id,
    noteId: a.noteId,
    originalName: a.originalName,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    createdAt: a.createdAt.toISOString(),
  };
}
