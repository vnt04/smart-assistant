import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { JobsService } from "./jobs.service";
import { JobEntity } from "./entities/job.entity";

type Where = Partial<Record<keyof JobEntity, unknown>>;

/** Repository TypeORM in-memory tối giản dùng cho JobsService. */
function makeRepo(seed: JobEntity[] = []) {
  const rows: JobEntity[] = [...seed];
  let seq = seed.length;
  const matches = (row: JobEntity, where: Where): boolean =>
    Object.entries(where).every(
      ([k, v]) => (row as unknown as Record<string, unknown>)[k] === v,
    );

  return {
    rows,
    async findOne({ where }: { where: Where }) {
      return rows.find((r) => matches(r, where)) ?? null;
    },
    async findOneOrFail({ where }: { where: Where }) {
      const r = rows.find((row) => matches(row, where));
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
      rows.push(saved);
      return saved;
    },
    async update(where: Where, patch: Partial<JobEntity>) {
      const r = rows.find((row) => matches(row, where));
      if (r) Object.assign(r, patch);
      return { affected: r ? 1 : 0 };
    },
    async find({ order }: { order?: { crawlAt?: "ASC" | "DESC" } } = {}) {
      const sorted = [...rows];
      if (order?.crawlAt === "DESC") {
        sorted.sort((a, b) => b.crawlAt.getTime() - a.crawlAt.getTime());
      }
      return sorted;
    },
    async delete(where: Where) {
      const idx = rows.findIndex((r) => matches(r, where));
      if (idx === -1) return { affected: 0 };
      rows.splice(idx, 1);
      return { affected: 1 };
    },
  };
}

function makeService(seed: JobEntity[] = []) {
  const repo = makeRepo(seed);
  const svc = new JobsService(repo as unknown as Repository<JobEntity>);
  return { svc, repo };
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
    const { svc, repo } = makeService();

    const res = await svc.ingest(payload());

    expect(res.status).toBe("created");
    expect(res.job).toMatchObject({
      jobId: "4410500631",
      title: "Kỹ Sư Phần Mềm",
      source: "linkedin",
    });
    expect(repo.rows).toHaveLength(1);
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
    const { svc, repo } = makeService();

    await svc.ingest(payload({ title: "Tiêu đề cũ" }));
    const res = await svc.ingest(payload({ title: "Tiêu đề mới", fitScore: 85 }));

    expect(res.status).toBe("updated");
    expect(res.job.title).toBe("Tiêu đề mới");
    expect(res.job.fitScore).toBe(85);
    expect(repo.rows).toHaveLength(1);
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
});

describe("JobsService.remove", () => {
  it("xóa job đang tồn tại", async () => {
    const { svc, repo } = makeService();
    const created = await svc.ingest(payload());

    await svc.remove(created.job.id);

    expect(repo.rows).toHaveLength(0);
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
