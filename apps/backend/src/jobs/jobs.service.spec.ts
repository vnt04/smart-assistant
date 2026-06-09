import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { DataSource, Repository } from "typeorm";
import { JobsService } from "./jobs.service";
import { JobEntity } from "./entities/job.entity";
import { TechnologyEntity } from "./entities/technology.entity";

type Where = Record<string, unknown>;

/** Lấy mảng giá trị nếu where[field] là FindOperator In(...), ngược lại null. */
function inValues(condition: unknown): string[] | null {
  if (condition && typeof condition === "object" && "value" in condition) {
    const value = (condition as { value: unknown }).value;
    if (Array.isArray(value)) return value as string[];
  }
  return null;
}

/**
 * Kho dữ liệu in-memory dùng chung cho cả `jobs`, `technologies` và bảng nối,
 * đủ để JobsService chạy qua transaction + query builder mà không cần DB thật.
 */
function makeStore(seed: JobEntity[] = []) {
  const jobs: JobEntity[] = [...seed];
  const technologies: TechnologyEntity[] = [];
  const junction: Array<{ jobId: string; technologyId: string }> = [];
  let seq = seed.length;

  const eq = (row: Record<string, unknown>, where: Where) =>
    Object.entries(where).every(([k, v]) => row[k] === v);

  const attachTechs = (job: JobEntity): JobEntity => ({
    ...job,
    technologies: junction
      .filter((j) => j.jobId === job.id)
      .map((j) => technologies.find((t) => t.id === j.technologyId))
      .filter((t): t is TechnologyEntity => t != null),
  });

  const jobRepo = {
    async findOne({ where }: { where: Where }) {
      return jobs.find((r) => eq(r as never, where)) ?? null;
    },
    async findOneOrFail({ where }: { where: Where }) {
      const r = jobs.find((row) => eq(row as never, where));
      if (!r) throw new Error("not found");
      return r;
    },
    create(partial: Partial<JobEntity>) {
      return { ...partial } as JobEntity;
    },
    async save(entity: JobEntity) {
      const now = new Date(0);
      const saved = {
        ...entity,
        id: entity.id ?? `id-${++seq}`,
        createdAt: entity.createdAt ?? now,
        updatedAt: entity.updatedAt ?? now,
      } as JobEntity;
      jobs.push(saved);
      return saved;
    },
    async update(where: Where, patch: Partial<JobEntity>) {
      const r = jobs.find((row) => eq(row as never, where));
      if (r) Object.assign(r, patch);
      return { affected: r ? 1 : 0 };
    },
    async find({
      order,
    }: { relations?: unknown; order?: { crawlAt?: "ASC" | "DESC" } } = {}) {
      const sorted = jobs.map(attachTechs);
      if (order?.crawlAt === "DESC") {
        sorted.sort((a, b) => b.crawlAt.getTime() - a.crawlAt.getTime());
      }
      return sorted;
    },
    async delete(where: Where) {
      const idx = jobs.findIndex((r) => eq(r as never, where));
      if (idx === -1) return { affected: 0 };
      jobs.splice(idx, 1);
      return { affected: 1 };
    },
    // Dùng cho list(slugs): lọc theo slug qua bảng nối.
    createQueryBuilder() {
      let slugs: string[] = [];
      const builder = {
        leftJoinAndSelect: () => builder,
        where: () => builder,
        setParameter: (key: string, value: unknown) => {
          if (key === "slugs" && Array.isArray(value)) slugs = value as string[];
          return builder;
        },
        orderBy: () => builder,
        async getMany() {
          const matchSlugs = new Set(slugs);
          const matchedTechIds = new Set(
            technologies.filter((t) => matchSlugs.has(t.slug)).map((t) => t.id),
          );
          const matchedJobIds = new Set(
            junction
              .filter((j) => matchedTechIds.has(j.technologyId))
              .map((j) => j.jobId),
          );
          return jobs
            .filter((j) => matchedJobIds.has(j.id))
            .map(attachTechs)
            .sort((a, b) => b.crawlAt.getTime() - a.crawlAt.getTime());
        },
      };
      return builder;
    },
    manager: {
      // Dùng cho listTechFacets(): đếm số job theo từng công nghệ.
      createQueryBuilder() {
        const builder = {
          select: () => builder,
          addSelect: () => builder,
          from: () => builder,
          innerJoin: () => builder,
          groupBy: () => builder,
          orderBy: () => builder,
          addOrderBy: () => builder,
          async getRawMany() {
            return technologies
              .map((t) => ({
                slug: t.slug,
                name: t.name,
                count: junction.filter((j) => j.technologyId === t.id).length,
              }))
              .filter((row) => row.count > 0)
              .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
          },
        };
        return builder;
      },
    },
  };

  const techRepo = {
    async find({ where }: { where: { slug?: unknown } }) {
      const slugs = inValues(where.slug);
      if (slugs) return technologies.filter((t) => slugs.includes(t.slug));
      return technologies.filter((t) => t.slug === where.slug);
    },
    async insert(values: Array<Partial<TechnologyEntity>>) {
      for (const v of values) {
        technologies.push({
          id: v.id as string,
          slug: v.slug as string,
          name: v.name as string,
          createdAt: new Date(0),
        });
      }
      return { identifiers: values.map((v) => ({ id: v.id })) };
    },
  };

  const manager = {
    getRepository(entity: unknown) {
      return entity === TechnologyEntity ? techRepo : jobRepo;
    },
    async query(sql: string, params: string[]) {
      if (sql.includes("DELETE FROM job_technologies")) {
        const jobId = params[0];
        for (let i = junction.length - 1; i >= 0; i--) {
          if (junction[i].jobId === jobId) junction.splice(i, 1);
        }
        return;
      }
      if (sql.includes("INSERT INTO job_technologies")) {
        for (let i = 0; i < params.length; i += 2) {
          junction.push({ jobId: params[i], technologyId: params[i + 1] });
        }
      }
    },
  };

  const dataSource = {
    async transaction(cb: (m: typeof manager) => Promise<unknown>) {
      return cb(manager);
    },
  };

  return { jobRepo, technologies, junction, dataSource };
}

function makeService(seed: JobEntity[] = []) {
  const store = makeStore(seed);
  const svc = new JobsService(
    store.jobRepo as unknown as Repository<JobEntity>,
    store.dataSource as unknown as DataSource,
  );
  return { svc, store };
}

/** Payload tối thiểu hợp lệ, ghi đè theo nhu cầu từng test. */
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    jobId: "4410500631",
    jobUrl: "https://www.linkedin.com/jobs/view/4410500631/",
    source: "linkedin",
    title: "Kỹ Sư Phần Mềm",
    company: "DXC Technology Vietnam",
    location: "Ho Chi Minh City, Vietnam",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    level: "Mid-Level",
    employmentType: "Full-time",
    postedAt: "2026-06-02",
    deadline: null,
    applicants: "Be among the first 25 applicants",
    techStack: JSON.stringify(["Java", "Spring"]),
    requirements: JSON.stringify(["3 năm kinh nghiệm"]),
    responsibilities: JSON.stringify(["Phát triển backend"]),
    benefits: JSON.stringify(["13th-month salary"]),
    description: "Mô tả công việc",
    fitScore: 0,
    fitReason: null,
    crawlAt: "2026-06-04T15:53:47.096Z",
    ...over,
  };
}

describe("JobsService.ingest", () => {
  it("tạo job mới với status 'created'", async () => {
    const { svc, store } = makeService();

    const res = await svc.ingest(payload());

    expect(res.status).toBe("created");
    expect(res.job).toMatchObject({
      jobId: "4410500631",
      title: "Kỹ Sư Phần Mềm",
      source: "linkedin",
    });
    expect(store.jobRepo).toBeDefined();
  });

  it("parse mảng từ chuỗi JSON.stringify thành string[]", async () => {
    const { svc } = makeService();

    const res = await svc.ingest(payload());

    expect(res.job.techStack).toEqual(["Java", "Spring"]);
    expect(res.job.requirements).toEqual(["3 năm kinh nghiệm"]);
  });

  it("chấp nhận mảng gửi thẳng (không stringify)", async () => {
    const { svc } = makeService();

    const res = await svc.ingest(
      payload({ techStack: ["Go", "Kubernetes"], benefits: [] }),
    );

    expect(res.job.techStack).toEqual(["Go", "Kubernetes"]);
    expect(res.job.benefits).toEqual([]);
  });

  it("ép jobId dạng số thành chuỗi", async () => {
    const { svc } = makeService();

    const res = await svc.ingest(payload({ jobId: 4410500631 }));

    expect(res.job.jobId).toBe("4410500631");
  });

  it("upsert: gửi lại jobId đã tồn tại thì cập nhật, không tạo bản ghi mới", async () => {
    const { svc } = makeService();

    await svc.ingest(payload({ title: "Tiêu đề cũ" }));
    const res = await svc.ingest(payload({ title: "Tiêu đề mới", fitScore: 85 }));

    expect(res.status).toBe("updated");
    expect(res.job.title).toBe("Tiêu đề mới");
    expect(res.job.fitScore).toBe(85);
    const list = await svc.list();
    expect(list).toHaveLength(1);
  });

  it("chuẩn hóa postedAt về YYYY-MM-DD từ chuỗi ISO đầy đủ", async () => {
    const { svc } = makeService();

    const res = await svc.ingest(payload({ postedAt: "2026-06-02T10:00:00.000Z" }));

    expect(res.job.postedAt).toBe("2026-06-02");
  });

  it("giữ salary và currency khi có giá trị", async () => {
    const { svc } = makeService();

    const res = await svc.ingest(
      payload({ salaryMin: 20000000, salaryMax: 25000000, salaryCurrency: "VND" }),
    );

    expect(res.job.salaryMin).toBe(20000000);
    expect(res.job.salaryMax).toBe(25000000);
    expect(res.job.salaryCurrency).toBe("VND");
  });

  it("giữ companyLogo do n8n gửi", async () => {
    const { svc } = makeService();
    const logo = "https://media.licdn.com/dms/image/company/logo.png";

    const res = await svc.ingest(payload({ companyLogo: logo }));

    expect(res.job.companyLogo).toBe(logo);
  });

  it("companyLogo mặc định rỗng khi thiếu", async () => {
    const { svc } = makeService();

    const res = await svc.ingest(payload());

    expect(res.job.companyLogo).toBe("");
  });

  it("hợp nhất biến thể công nghệ (ReactJS → react) và khử trùng lặp", async () => {
    const { svc, store } = makeService();

    await svc.ingest(payload({ techStack: ["React", "ReactJS", "react"] }));

    // Chỉ một technology 'react' được tạo, một liên kết duy nhất.
    expect(store.technologies.map((t) => t.slug)).toEqual(["react"]);
    expect(store.junction).toHaveLength(1);
  });

  it("re-crawl thay toàn bộ liên kết công nghệ (không tích lũy)", async () => {
    const { svc, store } = makeService();

    await svc.ingest(payload({ techStack: ["Java", "Spring"] }));
    await svc.ingest(payload({ techStack: ["Go"] }));

    expect(store.junction).toHaveLength(1);
    const onlyTech = store.technologies.find(
      (t) => t.id === store.junction[0].technologyId,
    );
    expect(onlyTech?.slug).toBe("go");
  });

  it("từ chối payload thiếu title với code 'job_invalid'", async () => {
    const { svc } = makeService();
    expect.assertions(2);
    try {
      await svc.ingest(payload({ title: "" }));
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(
        (e as BadRequestException).getResponse() as { code: string },
      ).toMatchObject({ code: "job_invalid" });
    }
  });

  it("từ chối payload thiếu jobId với code 'job_invalid'", async () => {
    const { svc } = makeService();
    expect.assertions(1);
    try {
      await svc.ingest(payload({ jobId: "" }));
    } catch (e) {
      expect(
        (e as BadRequestException).getResponse() as { code: string },
      ).toMatchObject({ code: "job_invalid" });
    }
  });
});

describe("JobsService.list", () => {
  it("trả về job mới crawl trước (crawlAt giảm dần)", async () => {
    const { svc } = makeService();
    await svc.ingest(payload({ jobId: "1", crawlAt: "2026-06-01T00:00:00.000Z" }));
    await svc.ingest(payload({ jobId: "2", crawlAt: "2026-06-05T00:00:00.000Z" }));

    const list = await svc.list();

    expect(list.map((j) => j.jobId)).toEqual(["2", "1"]);
  });

  it("lọc theo slug công nghệ", async () => {
    const { svc } = makeService();
    await svc.ingest(payload({ jobId: "1", techStack: ["Go"] }));
    await svc.ingest(payload({ jobId: "2", techStack: ["React"] }));

    const onlyGo = await svc.list(["go"]);

    expect(onlyGo.map((j) => j.jobId)).toEqual(["1"]);
  });
});

describe("JobsService.listTechFacets", () => {
  it("đếm số job theo công nghệ, nhiều job nhất trước", async () => {
    const { svc } = makeService();
    await svc.ingest(payload({ jobId: "1", techStack: ["Go", "React"] }));
    await svc.ingest(payload({ jobId: "2", techStack: ["Go"] }));

    const facets = await svc.listTechFacets();

    expect(facets[0]).toEqual({ slug: "go", name: "Go", count: 2 });
    expect(facets.find((f) => f.slug === "react")?.count).toBe(1);
  });
});

describe("JobsService.remove", () => {
  it("xóa job đang tồn tại", async () => {
    const { svc } = makeService();
    const created = await svc.ingest(payload());

    await svc.remove(created.job.id);

    const list = await svc.list();
    expect(list).toHaveLength(0);
  });

  it("ném job_not_found khi id không tồn tại", async () => {
    const { svc } = makeService();
    expect.assertions(2);
    try {
      await svc.remove("missing-id");
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      expect(
        (e as NotFoundException).getResponse() as { code: string },
      ).toMatchObject({ code: "job_not_found" });
    }
  });
});
