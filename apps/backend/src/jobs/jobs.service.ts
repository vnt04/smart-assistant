import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import {
  ingestJobInputSchema,
  type IngestJobInput,
  type IngestJobResponse,
  type Job,
} from "@assistant/shared";
import { JobEntity } from "./entities/job.entity";

/** Mã lỗi driver MySQL khi vi phạm ràng buộc unique. */
const MYSQL_DUPLICATE_ENTRY = "ER_DUP_ENTRY";

/** Các cột do payload crawler quản lý (không gồm id/jobId/timestamps tự sinh). */
type JobFields = Omit<JobEntity, "id" | "jobId" | "createdAt" | "updatedAt">;

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly repo: Repository<JobEntity>,
  ) {}

  /**
   * Nhận một job từ n8n. `jobId` là khóa chống trùng: nếu đã tồn tại thì cập
   * nhật (upsert) toàn bộ trường crawl, nếu chưa thì tạo mới.
   */
  async ingest(input: unknown): Promise<IngestJobResponse> {
    const parsed = ingestJobInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "job_invalid",
        message: "Dữ liệu công việc không hợp lệ",
        details: parsed.error.flatten(),
      });
    }

    const data = parsed.data;
    const fields = toFields(data);

    const existing = await this.repo.findOne({ where: { jobId: data.jobId } });
    if (existing) {
      await this.repo.update({ id: existing.id }, fields);
      const row = await this.repo.findOneOrFail({ where: { id: existing.id } });
      return { status: "updated", job: toDto(row) };
    }

    try {
      const saved = await this.repo.save(
        this.repo.create({ jobId: data.jobId, ...fields }),
      );
      return { status: "created", job: toDto(saved) };
    } catch (e) {
      // Một request song song vừa tạo cùng jobId — cập nhật thay vì báo lỗi.
      if (isDuplicateEntry(e)) {
        await this.repo.update({ jobId: data.jobId }, fields);
        const row = await this.repo.findOneOrFail({
          where: { jobId: data.jobId },
        });
        return { status: "updated", job: toDto(row) };
      }
      throw e;
    }
  }

  /** Danh sách job, mới crawl trước. */
  async list(): Promise<Job[]> {
    const rows = await this.repo.find({ order: { crawlAt: "DESC" } });
    return rows.map(toDto);
  }

  /** Xóa vĩnh viễn một job; ném `job_not_found` nếu id không tồn tại. */
  async remove(id: string): Promise<void> {
    const result = await this.repo.delete({ id });
    if (!result.affected) {
      throw new NotFoundException({
        code: "job_not_found",
        message: "Không tìm thấy công việc",
      });
    }
  }
}

/** Quy đổi input đã validate thành các cột của entity. */
function toFields(data: IngestJobInput): JobFields {
  return {
    jobUrl: data.jobUrl,
    source: data.source,
    title: data.title,
    company: data.company,
    location: data.location,
    salaryMin: data.salaryMin,
    salaryMax: data.salaryMax,
    salaryCurrency: data.salaryCurrency,
    level: data.level,
    employmentType: data.employmentType,
    postedAt: toDateOnly(data.postedAt),
    deadline: toDateOnly(data.deadline),
    applicants: data.applicants,
    techStack: data.techStack,
    requirements: data.requirements,
    responsibilities: data.responsibilities,
    benefits: data.benefits,
    description: data.description,
    fitScore: data.fitScore,
    fitReason: data.fitReason,
    crawlAt: toCrawlDate(data.crawlAt),
  };
}

/** Lấy phần ngày `YYYY-MM-DD` từ chuỗi ngày/ISO; rỗng hoặc không hợp lệ → null. */
function toDateOnly(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Chuyển crawlAt thành Date; thiếu hoặc không hợp lệ → thời điểm hiện tại. */
function toCrawlDate(value: string | null): Date {
  if (!value) return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function isDuplicateEntry(e: unknown): boolean {
  return (
    e instanceof QueryFailedError &&
    (e as QueryFailedError & { code?: string }).code === MYSQL_DUPLICATE_ENTRY
  );
}

function toDto(e: JobEntity): Job {
  return {
    id: e.id,
    jobId: e.jobId,
    jobUrl: e.jobUrl,
    source: e.source,
    title: e.title,
    company: e.company,
    location: e.location,
    salaryMin: e.salaryMin,
    salaryMax: e.salaryMax,
    salaryCurrency: e.salaryCurrency,
    level: e.level,
    employmentType: e.employmentType,
    postedAt: e.postedAt,
    deadline: e.deadline,
    applicants: e.applicants,
    techStack: e.techStack ?? [],
    requirements: e.requirements ?? [],
    responsibilities: e.responsibilities ?? [],
    benefits: e.benefits ?? [],
    description: e.description,
    fitScore: e.fitScore,
    fitReason: e.fitReason,
    crawlAt: e.crawlAt.toISOString(),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
