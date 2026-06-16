import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
  type SelectQueryBuilder,
} from "typeorm";
import {
  ingestJobInputSchema,
  jobSearchInputSchema,
  normalizeJobMatchProfile,
  scoreJob,
  type IngestJobInput,
  type IngestJobResponse,
  type Job,
  type JobFacetCount,
  type JobFacetsResponse,
  type JobMatchProfile,
  type JobSearchInput,
  type JobSearchResponse,
  type JobSearchSummary,
  type TechFacet,
} from "@assistant/shared";
import { JobEntity } from "./entities/job.entity";
import { TechnologyEntity } from "./entities/technology.entity";
import { normalizeTechList, type NormalizedTech } from "./tech-normalize";
import {
  DAY_MS,
  SALARY_15M,
  SALARY_30M,
  SALARY_50M,
  escapeLike,
  makeMeta,
  sortScored,
  summarizeScored,
  type ScoredJob,
} from "./jobs.search-utils";

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

      const pairs = orderedTechPairs(techs, techEntities);
      return {
        status,
        job: toDto(
          job,
          pairs.map((p) => p.name),
          pairs.map((p) => p.slug),
        ),
      };
    });
  }

  /** Danh sách job, mới crawl trước; lọc theo slug công nghệ nếu có. */
  async list(techSlugs: string[] = []): Promise<Job[]> {
    if (techSlugs.length === 0) {
      const rows = await this.repo.find({
        relations: { technologies: true },
        order: { crawlAt: "DESC" },
      });
      return rows.map((j) => toDtoFromEntity(j));
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
    return rows.map((j) => toDtoFromEntity(j));
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

  /**
   * Tìm/lọc/sắp xếp + phân trang phía server cho danh sách Jobs (`JobPage`).
   * Hai nhánh: barem TẮT → SQL `LIMIT/OFFSET` thuần; barem BẬT → nạp cả tập đã
   * lọc, chấm điểm bằng `scoreJob` (JS thuần, không biểu diễn được bằng SQL) rồi
   * cắt trang. Body được Zod-validate ở đây nên controller truyền `unknown`.
   */
  async search(input: unknown): Promise<JobSearchResponse> {
    const parsed = jobSearchInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "job_query_invalid",
        message: "Tham số tìm kiếm không hợp lệ",
        details: parsed.error.flatten(),
      });
    }
    const q = parsed.data;
    const profile =
      q.matchProfile && q.matchProfile.enabled
        ? normalizeJobMatchProfile(q.matchProfile)
        : null;
    return profile ? this.searchScored(q, profile) : this.searchPlain(q);
  }

  /** Facet đếm GLOBAL toàn bảng cho rail lọc + editor barem (fetch một lần). */
  async listFacets(): Promise<JobFacetsResponse> {
    const [levels, employmentTypes, sources, locations, tech] =
      await Promise.all([
        this.facetColumn("level"),
        this.facetColumn("employmentType"),
        this.facetColumn("source"),
        this.facetColumn("location"),
        this.listTechFacets(),
      ]);
    return { levels, employmentTypes, sources, locations, tech };
  }

  /**
   * Dựng WHERE dùng chung cho cả hai nhánh search. Mỗi nhóm mảng là OR-trong-nhóm
   * (qua `IN`); các nhóm AND với nhau. Lọc công nghệ qua subquery trên bảng nối
   * (dùng index) thay vì join để không nhân dòng.
   */
  private buildFilteredQb(q: JobSearchInput): SelectQueryBuilder<JobEntity> {
    const qb = this.repo.createQueryBuilder("j");

    if (q.q) {
      const kw = `%${escapeLike(q.q)}%`;
      qb.andWhere(
        "(j.title LIKE :kw OR j.company LIKE :kw OR j.location LIKE :kw)",
        { kw },
      );
    }
    if (q.level?.length) {
      qb.andWhere("j.level IN (:...levels)", { levels: q.level });
    }
    if (q.employmentType?.length) {
      qb.andWhere("j.employmentType IN (:...types)", { types: q.employmentType });
    }
    if (q.source?.length) {
      qb.andWhere("j.source IN (:...sources)", { sources: q.source });
    }
    if (q.location?.length) {
      qb.andWhere("j.location IN (:...locs)", { locs: q.location });
    }

    this.applySalaryBucket(qb, q.salaryBucket);

    if (q.postedWithinDays != null) {
      const since = new Date(Date.now() - q.postedWithinDays * DAY_MS);
      qb.andWhere("COALESCE(j.postedAt, j.crawlAt) >= :since", { since });
    }

    if (q.tech?.length) {
      qb.andWhere(
        `j.id IN (SELECT jt.job_id FROM job_technologies jt
          INNER JOIN technologies ft ON ft.id = jt.technology_id
          WHERE ft.slug IN (:...slugs))`,
        { slugs: q.tech },
      );
    }
    return qb;
  }

  /** Lọc theo bucket lương; rep = `COALESCE(salary_max, salary_min)` khớp client. */
  private applySalaryBucket(
    qb: SelectQueryBuilder<JobEntity>,
    bucket: JobSearchInput["salaryBucket"],
  ): void {
    if (!bucket) return;
    if (bucket === "thoa-thuan") {
      qb.andWhere("j.salaryMin IS NULL AND j.salaryMax IS NULL");
      return;
    }
    const rep = "COALESCE(j.salaryMax, j.salaryMin)";
    qb.andWhere(`${rep} IS NOT NULL`);
    if (bucket === "0-15") {
      qb.andWhere(`${rep} < :a`, { a: SALARY_15M });
    } else if (bucket === "15-30") {
      qb.andWhere(`${rep} >= :a AND ${rep} < :b`, {
        a: SALARY_15M,
        b: SALARY_30M,
      });
    } else if (bucket === "30-50") {
      qb.andWhere(`${rep} >= :a AND ${rep} < :b`, {
        a: SALARY_30M,
        b: SALARY_50M,
      });
    } else if (bucket === "50+") {
      qb.andWhere(`${rep} >= :a`, { a: SALARY_50M });
    }
  }

  /** Nhánh barem TẮT — phân trang SQL thật (chọn id theo thứ tự rồi nạp DTO). */
  private async searchPlain(q: JobSearchInput): Promise<JobSearchResponse> {
    const total = await this.buildFilteredQb(q).getCount();

    // `match` vô nghĩa khi barem tắt → quy về `crawl`.
    const sort = q.sort === "match" ? "crawl" : q.sort;
    const idQb = this.buildFilteredQb(q).select("j.id", "id");
    applySortPlain(idQb, sort);
    const idRows = await idQb
      .offset((q.page - 1) * q.limit)
      .limit(q.limit)
      .getRawMany<{ id: string }>();

    const items = await this.loadDtosByIds(idRows.map((r) => r.id));
    const summary = await this.summarizePlain(q, total);
    return { items, meta: makeMeta(q.page, q.limit, total), summary };
  }

  /** Nhánh barem BẬT — nạp cả tập đã lọc, chấm điểm JS, ẩn theo luật cứng, cắt trang. */
  private async searchScored(
    q: JobSearchInput,
    profile: JobMatchProfile,
  ): Promise<JobSearchResponse> {
    // getMany() hydrate đúng quan hệ to-many, không nhân dòng như leftJoin thường.
    const rows = await this.buildFilteredQb(q)
      .leftJoinAndSelect("j.technologies", "t")
      .getMany();

    const now = Date.now();
    const scored: ScoredJob[] = rows
      .map((r) => toDtoFromEntity(r))
      .map((job) => ({ job, result: scoreJob(job, profile, now) }))
      .filter((x) => !x.result.hidden);

    const ordered = sortScored(scored, q.sort);
    const total = ordered.length;
    const start = (q.page - 1) * q.limit;
    const items = ordered.slice(start, start + q.limit).map((x) => x.job);

    return {
      items,
      meta: makeMeta(q.page, q.limit, total),
      summary: summarizeScored(ordered, now),
    };
  }

  /** Nạp DTO theo danh sách id, giữ đúng thứ tự đã chọn ở bước phân trang. */
  private async loadDtosByIds(ids: string[]): Promise<Job[]> {
    if (ids.length === 0) return [];
    const rows = await this.repo.find({
      where: { id: In(ids) },
      relations: { technologies: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is JobEntity => r != null)
      .map((r) => toDtoFromEntity(r));
  }

  /** Tóm tắt thống kê cho nhánh barem TẮT (tính trên cả tập đã lọc, không 1 trang). */
  private async summarizePlain(
    q: JobSearchInput,
    total: number,
  ): Promise<JobSearchSummary> {
    const since7 = new Date(Date.now() - 7 * DAY_MS);
    const [new7, withSalaryCount] = await Promise.all([
      this.buildFilteredQb(q)
        .andWhere("COALESCE(j.postedAt, j.crawlAt) >= :since7", { since7 })
        .getCount(),
      this.buildFilteredQb(q)
        .andWhere("(j.salaryMin IS NOT NULL OR j.salaryMax IS NOT NULL)")
        .getCount(),
    ]);

    let medianSalary = 0;
    if (withSalaryCount > 0) {
      const mid = Math.floor((withSalaryCount - 1) / 2);
      const row = await this.buildFilteredQb(q)
        .andWhere("(j.salaryMin IS NOT NULL OR j.salaryMax IS NOT NULL)")
        .andWhere("COALESCE(j.salaryMax, j.salaryMin) > 0")
        .select("COALESCE(j.salaryMax, j.salaryMin)", "rep")
        .orderBy("rep", "ASC")
        .offset(mid)
        .limit(1)
        .getRawOne<{ rep: string | number }>();
      medianSalary = row ? Number(row.rep) : 0;
    }

    return {
      total,
      new7,
      withSalaryCount,
      medianSalary,
      matchEnabled: false,
      matchAvg: 0,
      matchTop: 0,
    };
  }

  /** Đếm số job theo từng giá trị của một cột (bỏ NULL/rỗng); nhiều nhất trước. */
  private async facetColumn(
    prop: "level" | "employmentType" | "source" | "location",
  ): Promise<JobFacetCount[]> {
    const rows = await this.repo
      .createQueryBuilder("j")
      .select(`j.${prop}`, "value")
      .addSelect("COUNT(*)", "count")
      .where(`j.${prop} IS NOT NULL AND j.${prop} <> ''`)
      .groupBy(`j.${prop}`)
      .orderBy("count", "DESC")
      .addOrderBy("value", "ASC")
      .getRawMany<{ value: string; count: string | number }>();
    return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
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

/** Cặp tên hiển thị + slug của một công nghệ. */
interface TechPair {
  name: string;
  slug: string;
}

/** Cặp {name, slug} theo đúng thứ tự đã chuẩn hóa của input (cho response ingest). */
function orderedTechPairs(
  techs: NormalizedTech[],
  entities: TechnologyEntity[],
): TechPair[] {
  const bySlug = new Map(entities.map((t) => [t.slug, t.name]));
  return techs
    .map((t) => {
      const name = bySlug.get(t.slug);
      return name ? { name, slug: t.slug } : null;
    })
    .filter((p): p is TechPair => p !== null);
}

/** Cặp {name, slug} của job đã nạp quan hệ, sắp theo tên (căn chỉ số DTO). */
function techPairs(job: JobEntity): TechPair[] {
  return [...(job.technologies ?? [])]
    .map((t) => ({ name: t.name, slug: t.slug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Áp ORDER BY cho nhánh phân trang SQL (barem tắt). Dựa vào hành vi mặc định của
 * MySQL — `ORDER BY col DESC` đẩy NULL xuống cuối — để job thiếu lương/ngày luôn
 * nằm dưới, khớp với client (`repSalary` null → -1, `dateValue` null → 0). Thêm
 * `j.id` làm tie-break để thứ tự ổn định giữa các trang.
 */
function applySortPlain(
  qb: SelectQueryBuilder<JobEntity>,
  sort: "crawl" | "posted" | "salary",
): void {
  if (sort === "posted") {
    qb.addOrderBy("j.postedAt", "DESC");
  } else if (sort === "salary") {
    // Sắp theo lương đại diện qua alias đã SELECT (ORDER BY alias an toàn,
    // không phụ thuộc cách TypeORM thay tên cột trong biểu thức hàm).
    qb.addSelect("COALESCE(j.salaryMax, j.salaryMin)", "rep");
    qb.addOrderBy("rep", "DESC");
  } else {
    qb.addOrderBy("j.crawlAt", "DESC");
  }
  qb.addOrderBy("j.id", "ASC");
}

/** Dựng DTO từ entity đã nạp quan hệ `technologies`. */
function toDtoFromEntity(job: JobEntity): Job {
  const pairs = techPairs(job);
  return toDto(
    job,
    pairs.map((p) => p.name),
    pairs.map((p) => p.slug),
  );
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

function toDto(e: JobEntity, techStack: string[], techSlugs: string[]): Job {
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
    techSlugs,
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
