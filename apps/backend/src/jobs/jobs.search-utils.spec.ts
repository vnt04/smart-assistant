import type { Job, JobMatchResult } from "@assistant/shared";
import {
  escapeLike,
  makeMeta,
  repOf,
  sortScored,
  summarizeScored,
  timeOf,
  type ScoredJob,
} from "./jobs.search-utils";

/** Job tối thiểu hợp lệ; ghi đè theo nhu cầu từng test. */
function job(over: Partial<Job> = {}): Job {
  return {
    id: over.id ?? "id-1",
    jobId: "1",
    jobUrl: "",
    source: "linkedin",
    title: "Engineer",
    company: "ACME",
    companyLogo: "",
    location: "Ho Chi Minh",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    level: null,
    employmentType: null,
    postedAt: null,
    deadline: null,
    applicants: null,
    techStack: [],
    techSlugs: [],
    requirements: [],
    responsibilities: [],
    benefits: [],
    description: "",
    fitScore: null,
    fitReason: null,
    crawlAt: "2026-06-01T00:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

/** Bọc job thành ScoredJob với điểm chỉ định (phần khác của result không xét). */
function scored(j: Job, score: number): ScoredJob {
  const result: JobMatchResult = {
    score,
    tier: "fair",
    matchedTechs: [],
    breakdown: [],
    hidden: false,
  };
  return { job: j, result };
}

describe("repOf", () => {
  it("ưu tiên trần, rồi sàn, không có → null", () => {
    expect(repOf(job({ salaryMin: 10, salaryMax: 20 }))).toBe(20);
    expect(repOf(job({ salaryMin: 10, salaryMax: null }))).toBe(10);
    expect(repOf(job({ salaryMin: null, salaryMax: null }))).toBeNull();
  });
});

describe("timeOf", () => {
  it("ưu tiên postedAt, thiếu thì dùng crawlAt", () => {
    const t = timeOf(
      job({ postedAt: "2026-06-10", crawlAt: "2026-06-01T00:00:00.000Z" }),
    );
    expect(t).toBe(new Date("2026-06-10").getTime());
  });

  it("ngày hỏng → 0", () => {
    expect(timeOf(job({ postedAt: "not-a-date", crawlAt: "also-bad" }))).toBe(0);
  });
});

describe("sortScored", () => {
  it("match: điểm cao trước", () => {
    const a = scored(job({ id: "a" }), 30);
    const b = scored(job({ id: "b" }), 90);
    const out = sortScored([a, b], "match");
    expect(out.map((s) => s.job.id)).toEqual(["b", "a"]);
  });

  it("salary: lương cao trước, không lương xuống cuối", () => {
    const a = scored(job({ id: "a", salaryMax: 10_000_000 }), 0);
    const b = scored(job({ id: "b", salaryMax: 50_000_000 }), 0);
    const c = scored(job({ id: "c", salaryMin: null, salaryMax: null }), 0);
    const out = sortScored([a, c, b], "salary");
    expect(out.map((s) => s.job.id)).toEqual(["b", "a", "c"]);
  });

  it("posted: mới đăng trước, thiếu ngày xuống cuối", () => {
    const a = scored(job({ id: "a", postedAt: "2026-06-01" }), 0);
    const b = scored(job({ id: "b", postedAt: "2026-06-10" }), 0);
    const c = scored(job({ id: "c", postedAt: null }), 0);
    const out = sortScored([a, c, b], "posted");
    expect(out.map((s) => s.job.id)).toEqual(["b", "a", "c"]);
  });

  it("crawl: mới crawl trước", () => {
    const a = scored(job({ id: "a", crawlAt: "2026-06-01T00:00:00.000Z" }), 0);
    const b = scored(job({ id: "b", crawlAt: "2026-06-05T00:00:00.000Z" }), 0);
    const out = sortScored([a, b], "crawl");
    expect(out.map((s) => s.job.id)).toEqual(["b", "a"]);
  });

  it("không mutate mảng đầu vào (immutable)", () => {
    const input = [scored(job({ id: "a" }), 1), scored(job({ id: "b" }), 9)];
    const snapshot = input.map((s) => s.job.id);
    sortScored(input, "match");
    expect(input.map((s) => s.job.id)).toEqual(snapshot);
  });
});

describe("summarizeScored", () => {
  const now = new Date("2026-06-15T00:00:00.000Z").getTime();

  it("tổng hợp total/new7/withSalary/median/matchAvg/matchTop", () => {
    const arr = [
      scored(job({ id: "a", salaryMax: 20_000_000, postedAt: "2026-06-12" }), 90),
      scored(job({ id: "b", salaryMax: 40_000_000, postedAt: "2026-05-01" }), 60),
      scored(job({ id: "c", salaryMin: null, salaryMax: null, postedAt: null }), 30),
    ];
    const s = summarizeScored(arr, now);
    expect(s.total).toBe(3);
    expect(s.matchEnabled).toBe(true);
    expect(s.withSalaryCount).toBe(2);
    expect(s.medianSalary).toBe(20_000_000); // mid của [20tr, 40tr]
    expect(s.new7).toBe(1); // chỉ job a trong 7 ngày
    expect(s.matchAvg).toBe(60); // (90+60+30)/3
    expect(s.matchTop).toBe(1); // chỉ điểm 90 >= 80
  });

  it("tập rỗng → tất cả 0 nhưng matchEnabled true", () => {
    const s = summarizeScored([], now);
    expect(s).toMatchObject({
      total: 0,
      new7: 0,
      withSalaryCount: 0,
      medianSalary: 0,
      matchAvg: 0,
      matchTop: 0,
      matchEnabled: true,
    });
  });
});

describe("makeMeta", () => {
  it("tính totalPages theo limit", () => {
    expect(makeMeta(2, 24, 50)).toEqual({
      page: 2,
      limit: 24,
      total: 50,
      totalPages: 3,
    });
  });

  it("totalPages tối thiểu 1 khi không có kết quả", () => {
    expect(makeMeta(1, 24, 0).totalPages).toBe(1);
  });
});

describe("escapeLike", () => {
  it("escape % _ và backslash", () => {
    expect(escapeLike("50%_off\\x")).toBe("50\\%\\_off\\\\x");
  });

  it("chuỗi thường không đổi", () => {
    expect(escapeLike("react native")).toBe("react native");
  });
});
