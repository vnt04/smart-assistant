import { z } from "zod";
import { idSchema } from "./common.js";

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
