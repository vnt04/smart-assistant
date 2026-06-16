import { z } from "zod";
import { idSchema, paginationMetaSchema } from "./common.js";
import { jobMatchProfileSchema } from "./job-match.js";

/** Field length limits — kept in sync with the `jobs` table column widths. */
export const MAX_JOB_ID_LENGTH = 64;
export const MAX_JOB_TITLE_LENGTH = 512;

/**
 * n8n gửi các mảng dưới dạng chuỗi `JSON.stringify([...])`, nhưng cũng có thể
 * gửi thẳng mảng. Chuẩn hóa cả hai về `string[]`; đầu vào hỏng → mảng rỗng.
 */
const stringArrayField = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}, z.array(z.string().trim().min(1).max(500)).max(200));

/** jobId có thể tới dạng số hoặc chuỗi — luôn lưu thành chuỗi. */
const jobIdField = z.preprocess(
  (value) => (typeof value === "number" ? String(value) : value),
  z.string().trim().min(1).max(MAX_JOB_ID_LENGTH),
);

/** Trần của cột `INT UNSIGNED` trong MySQL — clamp để không tràn số. */
const UNSIGNED_INT_MAX = 4294967295;

/**
 * Số tiền không âm hoặc null. Chuỗi rỗng / không parse được → null; giá trị
 * được làm tròn và clamp về [0, UNSIGNED_INT_MAX] để khớp cột DB.
 */
const nullableMoney = z.preprocess((value) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n), UNSIGNED_INT_MAX);
}, z.number().int().nonnegative().nullable());

/** Chuỗi đã trim hoặc null; chuỗi rỗng → null. */
function nullableString(max: number) {
  return z.preprocess((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    }
    return value;
  }, z.string().max(max).nullable());
}

/**
 * Request body cho POST /jobs (n8n gọi). Hình dạng khớp payload crawler:
 * jobId là khóa chống trùng. Các trường thiếu được điền mặc định an toàn.
 */
export const ingestJobInputSchema = z.object({
  jobId: jobIdField,
  jobUrl: nullableString(1024).transform((v) => v ?? ""),
  source: nullableString(32).transform((v) => v ?? "unknown"),
  title: z.string().trim().min(1).max(MAX_JOB_TITLE_LENGTH),
  company: nullableString(255).transform((v) => v ?? ""),
  companyLogo: nullableString(1024).transform((v) => v ?? ""),
  location: nullableString(255).transform((v) => v ?? ""),

  salaryMin: nullableMoney,
  salaryMax: nullableMoney,
  salaryCurrency: nullableString(8),

  level: nullableString(64),
  employmentType: nullableString(64),
  postedAt: nullableString(32),
  deadline: nullableString(32),
  applicants: nullableString(128),

  techStack: stringArrayField,
  requirements: stringArrayField,
  responsibilities: stringArrayField,
  benefits: stringArrayField,

  description: z
    .string()
    .max(20000)
    .optional()
    .transform((v) => v ?? ""),
  // Điểm phù hợp 0–100. Giá trị ngoài khoảng được clamp thay vì từ chối job.
  fitScore: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, Math.round(n)));
  }, z.number().int().min(0).max(100).nullable()),
  fitReason: nullableString(5000),

  crawlAt: nullableString(40),
});
export type IngestJobInput = z.infer<typeof ingestJobInputSchema>;

/** Job model trả về cho client. Mảng đã là `string[]`; ngày là ISO/`YYYY-MM-DD`. */
export const jobSchema = z.object({
  id: idSchema,
  jobId: z.string(),
  jobUrl: z.string(),
  source: z.string(),
  title: z.string(),
  company: z.string(),
  companyLogo: z.string(),
  location: z.string(),

  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),

  level: z.string().nullable(),
  employmentType: z.string().nullable(),
  postedAt: z.string().nullable(),
  deadline: z.string().nullable(),
  applicants: z.string().nullable(),

  techStack: z.array(z.string()),
  /**
   * Slug công nghệ đã chuẩn hóa, **căn theo chỉ số** với `techStack`
   * (`techSlugs[i]` là slug của `techStack[i]`). Dùng để khớp barem theo slug
   * và tô sáng đúng tag công nghệ khớp trên thẻ job.
   */
  techSlugs: z.array(z.string()),
  requirements: z.array(z.string()),
  responsibilities: z.array(z.string()),
  benefits: z.array(z.string()),

  description: z.string(),
  fitScore: z.number().nullable(),
  fitReason: z.string().nullable(),

  crawlAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof jobSchema>;

/** Success envelope cho POST /jobs: created (mới) hoặc updated (upsert). */
export const ingestJobResponseSchema = z.object({
  status: z.enum(["created", "updated"]),
  job: jobSchema,
});
export type IngestJobResponse = z.infer<typeof ingestJobResponseSchema>;

/** Response cho GET /jobs — danh sách job, mới crawl trước. */
export const jobListResponseSchema = z.array(jobSchema);
export type JobListResponse = z.infer<typeof jobListResponseSchema>;

/**
 * Một mục facet công nghệ: `slug` đã chuẩn hóa (khóa lọc), `name` để hiển thị,
 * `count` là số job đang gắn công nghệ đó. Dùng dựng bộ lọc theo công nghệ.
 */
export const techFacetSchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});
export type TechFacet = z.infer<typeof techFacetSchema>;

/** Response cho GET /jobs/tech-facets — facet nhiều job nhất trước. */
export const techFacetListResponseSchema = z.array(techFacetSchema);
export type TechFacetListResponse = z.infer<typeof techFacetListResponseSchema>;

/* -------------------- Tìm kiếm + phân trang phía server -------------------- */

/** Tiêu chí sắp xếp danh sách job. `match` cần barem (chấm điểm phía server). */
export const jobSortSchema = z.enum(["crawl", "posted", "salary", "match"]);
export type JobSort = z.infer<typeof jobSortSchema>;

/** Bucket lương — khớp đúng ngưỡng ở rail JobPage (15tr/30tr/50tr). */
export const jobSalaryBucketSchema = z.enum([
  "thoa-thuan",
  "0-15",
  "15-30",
  "30-50",
  "50+",
]);
export type JobSalaryBucket = z.infer<typeof jobSalaryBucketSchema>;

/**
 * Tham số `POST /jobs/search`. Mảng (tech/level/…) = chọn nhiều (OR trong nhóm).
 * `matchProfile` chỉ gửi khi người dùng bật barem; server dùng để chấm điểm,
 * sắp xếp `match`, và ẩn job theo luật cứng (hideMissingMustHave/minSalary/minScore).
 */
export const jobSearchInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  tech: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  level: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  employmentType: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  source: z.array(z.string().trim().min(1).max(32)).max(50).optional(),
  location: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
  salaryBucket: jobSalaryBucketSchema.optional(),
  postedWithinDays: z.coerce.number().int().min(1).max(3650).optional(),
  sort: jobSortSchema.default("crawl"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  matchProfile: jobMatchProfileSchema.optional(),
});
export type JobSearchInput = z.infer<typeof jobSearchInputSchema>;

/** Tóm tắt thống kê cho StatsBar (tính trên tập ĐÃ LỌC, không phải một trang). */
export const jobSearchSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  new7: z.number().int().nonnegative(),
  withSalaryCount: z.number().int().nonnegative(),
  medianSalary: z.number().int().nonnegative(),
  matchEnabled: z.boolean(),
  matchAvg: z.number().int().nonnegative(),
  matchTop: z.number().int().nonnegative(),
});
export type JobSearchSummary = z.infer<typeof jobSearchSummarySchema>;

/** Response `POST /jobs/search`. `items` là một trang; `summary` trên cả tập lọc. */
export const jobSearchResponseSchema = z.object({
  items: z.array(jobSchema),
  meta: paginationMetaSchema,
  summary: jobSearchSummarySchema,
});
export type JobSearchResponse = z.infer<typeof jobSearchResponseSchema>;

/** Một mục facet `{value,count}` cho rail (cấp bậc/hình thức/nguồn/địa điểm). */
export const jobFacetCountSchema = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});
export type JobFacetCount = z.infer<typeof jobFacetCountSchema>;

/** Response `GET /jobs/facets` — đếm GLOBAL toàn bảng (không theo bộ lọc đang chọn). */
export const jobFacetsResponseSchema = z.object({
  levels: z.array(jobFacetCountSchema),
  employmentTypes: z.array(jobFacetCountSchema),
  sources: z.array(jobFacetCountSchema),
  locations: z.array(jobFacetCountSchema),
  tech: z.array(techFacetSchema),
});
export type JobFacetsResponse = z.infer<typeof jobFacetsResponseSchema>;
