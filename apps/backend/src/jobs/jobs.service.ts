import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from "typeorm";
import {
  ingestJobInputSchema,
  type IngestJobInput,
  type IngestJobResponse,
  type Job,
  type TechFacet,
} from "@assistant/shared";
import { JobEntity } from "./entities/job.entity";
import { TechnologyEntity } from "./entities/technology.entity";
import { normalizeTechList, type NormalizedTech } from "./tech-normalize";

/** Mã lỗi driver MySQL khi vi phạm ràng buộc unique. */
const MYSQL_DUPLICATE_ENTRY = "ER_DUP_ENTRY";

/** Các cột do payload crawler quản lý (không gồm id/jobId/quan hệ/timestamps). */
type JobFields = Omit<
  JobEntity,
  "id" | "jobId" | "technologies" | "createdAt" | "updatedAt"
>;

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly repo: Repository<JobEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Nhận một job từ n8n. `jobId` là khóa chống trùng: đã tồn tại thì cập nhật,
   * chưa thì tạo mới. Đồng thời chuẩn hóa `techStack` thành các `technologies`
   * và đồng bộ bảng nối — toàn bộ trong một transaction để không lệch dữ liệu.
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
    const techs = normalizeTechList(data.techStack);

    return this.dataSource.transaction(async (manager) => {
      const jobRepo = manager.getRepository(JobEntity);
      const existing = await jobRepo.findOne({ where: { jobId: data.jobId } });

      let job: JobEntity;
      let status: "created" | "updated";
      if (existing) {
        await jobRepo.update({ id: existing.id }, fields);
        job = await jobRepo.findOneOrFail({ where: { id: existing.id } });
        status = "updated";
      } else {
        try {
          job = await jobRepo.save(
            jobRepo.create({ jobId: data.jobId, ...fields }),
          );
          status = "created";
        } catch (e) {
          // Một request song song vừa tạo cùng jobId — cập nhật thay vì lỗi.
          if (!isDuplicateEntry(e)) throw e;
          await jobRepo.update({ jobId: data.jobId }, fields);
          job = await jobRepo.findOneOrFail({ where: { jobId: data.jobId } });
          status = "updated";
        }
      }

      const techEntities = await upsertTechnologies(manager, techs);
      await syncJobTechnologies(
        manager,
        job.id,
        techEntities.map((t) => t.id),
      );

      return { status, job: toDto(job, orderedTechNames(techs, techEntities)) };
    });
  }

  /** Danh sách job, mới crawl trước; lọc theo slug công nghệ nếu có. */
  async list(techSlugs: string[] = []): Promise<Job[]> {
    if (techSlugs.length === 0) {
      const rows = await this.repo.find({
        relations: { technologies: true },
        order: { crawlAt: "DESC" },
      });
      return rows.map((j) => toDto(j, techNames(j)));
    }

    // Lọc bằng subquery trên bảng nối (dùng index), nhưng vẫn nạp toàn bộ
    // technologies của các job khớp để hiển thị.
    const qb = this.repo
      .createQueryBuilder("j")
      .leftJoinAndSelect("j.technologies", "t")
      .where((sub) => {
        const subQuery = sub
          .subQuery()
          .select("jt.job_id")
          .from("job_technologies", "jt")
          .innerJoin("technologies", "ft", "ft.id = jt.technology_id")
          .where("ft.slug IN (:...slugs)")
          .getQuery();
        return `j.id IN ${subQuery}`;
      })
      .setParameter("slugs", techSlugs)
      .orderBy("j.crawlAt", "DESC");

    const rows = await qb.getMany();
    return rows.map((j) => toDto(j, techNames(j)));
  }

  /** Facet công nghệ: mỗi công nghệ kèm số job; nhiều job nhất trước. */
  async listTechFacets(): Promise<TechFacet[]> {
    const rows: Array<{ slug: string; name: string; count: string | number }> =
      await this.repo.manager
        .createQueryBuilder()
        .select("t.slug", "slug")
        .addSelect("t.name", "name")
        .addSelect("COUNT(jt.job_id)", "count")
        .from(TechnologyEntity, "t")
        .innerJoin("job_technologies", "jt", "jt.technology_id = t.id")
        .groupBy("t.id")
        .orderBy("count", "DESC")
        .addOrderBy("t.name", "ASC")
        .getRawMany();

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      count: Number(r.count),
    }));
  }

  /** Xóa vĩnh viễn một job; bảng nối tự dọn theo FK CASCADE. */
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

/** Upsert technologies theo slug, giữ tên hiển thị lần đầu (INSERT IGNORE). */
async function upsertTechnologies(
  manager: EntityManager,
  techs: NormalizedTech[],
): Promise<TechnologyEntity[]> {
  if (techs.length === 0) return [];

  const techRepo = manager.getRepository(TechnologyEntity);
  const slugs = techs.map((t) => t.slug);
  const existing = await techRepo.find({ where: { slug: In(slugs) } });
  const existingSlugs = new Set(existing.map((t) => t.slug));
  const missing = techs.filter((t) => !existingSlugs.has(t.slug));

  if (missing.length === 0) return existing;

  try {
    await techRepo.insert(
      missing.map((t) => ({ id: randomUUID(), slug: t.slug, name: t.name })),
    );
  } catch (e) {
    // Request song song vừa chèn cùng slug — bỏ qua, nạp lại bên dưới.
    if (!isDuplicateEntry(e)) throw e;
  }
  return techRepo.find({ where: { slug: In(slugs) } });
}

/** Thay toàn bộ liên kết job↔technology (re-crawl ghi đè). */
async function syncJobTechnologies(
  manager: EntityManager,
  jobId: string,
  techIds: string[],
): Promise<void> {
  await manager.query("DELETE FROM job_technologies WHERE job_id = ?", [jobId]);
  if (techIds.length === 0) return;
  const placeholders = techIds.map(() => "(?, ?)").join(", ");
  const params = techIds.flatMap((id) => [jobId, id]);
  await manager.query(
    `INSERT INTO job_technologies (job_id, technology_id) VALUES ${placeholders}`,
    params,
  );
}

/** Tên hiển thị theo đúng thứ tự đã chuẩn hóa của input. */
function orderedTechNames(
  techs: NormalizedTech[],
  entities: TechnologyEntity[],
): string[] {
  const bySlug = new Map(entities.map((t) => [t.slug, t.name]));
  return techs
    .map((t) => bySlug.get(t.slug))
    .filter((n): n is string => n != null);
}

/** Tên công nghệ của một job đã nạp quan hệ (thứ tự theo tên). */
function techNames(job: JobEntity): string[] {
  return [...(job.technologies ?? [])]
    .map((t) => t.name)
    .sort((a, b) => a.localeCompare(b));
}

/** Quy đổi input đã validate thành các cột của entity. */
function toFields(data: IngestJobInput): JobFields {
  return {
    jobUrl: data.jobUrl,
    source: data.source,
    title: data.title,
    company: data.company,
    companyLogo: data.companyLogo,
    location: data.location,
    salaryMin: data.salaryMin,
    salaryMax: data.salaryMax,
    salaryCurrency: data.salaryCurrency,
    level: data.level,
    employmentType: data.employmentType,
    postedAt: toDateOnly(data.postedAt),
    deadline: toDateOnly(data.deadline),
    applicants: data.applicants,
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

function toDto(e: JobEntity, techStack: string[]): Job {
  return {
    id: e.id,
    jobId: e.jobId,
    jobUrl: e.jobUrl,
    source: e.source,
    title: e.title,
    company: e.company,
    companyLogo: e.companyLogo,
    location: e.location,
    salaryMin: e.salaryMin,
    salaryMax: e.salaryMax,
    salaryCurrency: e.salaryCurrency,
    level: e.level,
    employmentType: e.employmentType,
    postedAt: e.postedAt,
    deadline: e.deadline,
    applicants: e.applicants,
    techStack,
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
