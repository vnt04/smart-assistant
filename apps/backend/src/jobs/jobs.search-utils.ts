import type {
  Job,
  JobMatchResult,
  JobSearchInput,
  JobSearchSummary,
  PaginationMeta,
} from "@assistant/shared";

/**
 * Helper thuần (không phụ thuộc DB/thời gian hệ thống) cho `POST /jobs/search`.
 * Tách khỏi `jobs.service.ts` để chấm điểm/sắp xếp/tóm tắt khi bật barem có thể
 * unit-test trực tiếp mà không cần mock QueryBuilder. Các ngưỡng lương phải khớp
 * `salaryBucketOf` ở frontend (`JobPage.tsx`) để bộ lọc nhất quán hai phía.
 */

/** Ngưỡng bucket lương (VND) — khớp JobPage. */
export const SALARY_15M = 15_000_000;
export const SALARY_30M = 30_000_000;
export const SALARY_50M = 50_000_000;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Điểm tối thiểu để tính là "rất phù hợp" trong summary (khớp tier excellent). */
const MATCH_TOP_THRESHOLD = 80;

/** Một job kèm kết quả chấm điểm barem. */
export interface ScoredJob {
  job: Job;
  result: JobMatchResult;
}

/** Lương đại diện (VND): ưu tiên trần, rồi sàn; không có → null (Thỏa thuận). */
export function repOf(job: Job): number | null {
  return job.salaryMax ?? job.salaryMin ?? null;
}

/** Mốc thời gian job (ms): ưu tiên ngày đăng, thiếu thì dùng thời điểm crawl. */
export function timeOf(job: Job): number {
  const t = new Date(job.postedAt ?? job.crawlAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Giá trị thời gian từ chuỗi ngày/ISO; rỗng hoặc hỏng → 0. */
function dateVal(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Sắp xếp các job đã chấm điểm theo tiêu chí. Trả về MẢNG MỚI (không mutate đầu
 * vào). Job thiếu lương/ngày luôn xuống cuối (rep/null → -1, date → 0).
 */
export function sortScored(
  arr: ScoredJob[],
  sort: JobSearchInput["sort"],
): ScoredJob[] {
  const sorted = [...arr];
  if (sort === "match") {
    sorted.sort((a, b) => b.result.score - a.result.score);
  } else if (sort === "salary") {
    sorted.sort((a, b) => (repOf(b.job) ?? -1) - (repOf(a.job) ?? -1));
  } else if (sort === "posted") {
    sorted.sort((a, b) => dateVal(b.job.postedAt) - dateVal(a.job.postedAt));
  } else {
    sorted.sort((a, b) => dateVal(b.job.crawlAt) - dateVal(a.job.crawlAt));
  }
  return sorted;
}

/** Số job có lương (min hoặc max khác null) — khớp ngữ nghĩa StatsBar client. */
function withSalaryCountOf(jobs: Job[]): number {
  return jobs.filter((j) => j.salaryMin != null || j.salaryMax != null).length;
}

/** Lương trung vị (VND) trên các rep > 0; rỗng → 0. */
function medianSalaryOf(jobs: Job[]): number {
  const reps = jobs
    .map(repOf)
    .filter((n): n is number => n != null && n > 0)
    .sort((a, b) => a - b);
  return reps.length ? reps[Math.floor((reps.length - 1) / 2)] : 0;
}

/** Tóm tắt thống kê cho nhánh barem BẬT (tính trên cả tập đã lọc + đã chấm). */
export function summarizeScored(
  scored: ScoredJob[],
  nowMs: number,
): JobSearchSummary {
  const jobs = scored.map((s) => s.job);
  const scores = scored.map((s) => s.result.score);
  const matchAvg = scores.length
    ? Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length)
    : 0;
  return {
    total: jobs.length,
    new7: jobs.filter((j) => {
      const t = timeOf(j);
      return t > 0 && nowMs - t <= 7 * DAY_MS;
    }).length,
    withSalaryCount: withSalaryCountOf(jobs),
    medianSalary: medianSalaryOf(jobs),
    matchEnabled: true,
    matchAvg,
    matchTop: scores.filter((s) => s >= MATCH_TOP_THRESHOLD).length,
  };
}

/** Dựng `PaginationMeta`; `totalPages` tối thiểu 1 để UI không hiện 0/0. */
export function makeMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Escape ký tự đặc biệt của LIKE (`% _ \`) để chuỗi tìm kiếm không phá mẫu. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
