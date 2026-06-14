import { z } from "zod";
import { idSchema } from "./common.js";

/**
 * Đồng bộ việc làm tự động (cron) — kéo job từ public API của VietnamWorks về
 * bảng `jobs` chung. Một "nguồn sync" (source) gồm: danh sách từ khóa tìm kiếm,
 * bộ lọc địa điểm, phân trang, và lịch chạy. Mỗi lần chạy ghi một "run" vào lịch
 * sử để theo dõi trạng thái.
 *
 * Backend validate input theo các schema này tại biên controller; frontend parse
 * lại response để bắt lệch hợp đồng.
 */

/** Nguồn dữ liệu hỗ trợ. Hiện chỉ VietnamWorks; để enum cho dễ mở rộng sau. */
export const jobSyncProviderSchema = z.enum(["vietnamworks"]);
export type JobSyncProvider = z.infer<typeof jobSyncProviderSchema>;

/** Mốc giờ trong ngày dạng `HH:MM` (24h). */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ phải có dạng HH:MM (24 giờ)");

/** Giới hạn khoảng lặp: tối thiểu 15 phút (tránh spam VietnamWorks), tối đa 1 ngày. */
export const MIN_INTERVAL_MINUTES = 15;
export const MAX_INTERVAL_MINUTES = 1440;

/**
 * Lịch chạy: hoặc theo khoảng lặp (mỗi N phút), hoặc theo các mốc giờ cố định
 * trong ngày (vd 08:00 và 18:00).
 */
export const jobSyncScheduleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("interval"),
    everyMinutes: z
      .number()
      .int()
      .min(MIN_INTERVAL_MINUTES)
      .max(MAX_INTERVAL_MINUTES),
  }),
  z.object({
    kind: z.literal("daily"),
    times: z
      .array(timeOfDaySchema)
      .min(1)
      .max(12)
      // Khử trùng + sắp xếp để lịch ổn định, không tạo scheduler thừa.
      .transform((arr) => [...new Set(arr)].sort()),
  }),
]);
export type JobSyncSchedule = z.infer<typeof jobSyncScheduleSchema>;

/**
 * Bộ lọc tìm kiếm. `cityId` theo mã thành phố của VietnamWorks (vd Hồ Chí Minh =
 * 29); null = toàn quốc. `districtIds` là các quận/huyện trong thành phố đó; rỗng
 * = tất cả quận/huyện.
 */
export const jobSyncFiltersSchema = z.object({
  cityId: z.number().int().positive().nullable().default(null),
  districtIds: z.array(z.number().int().positive()).max(50).default([]),
});
export type JobSyncFilters = z.infer<typeof jobSyncFiltersSchema>;

/** Từ khóa tìm kiếm: 1–20 từ khóa, mỗi từ ≤ 100 ký tự, đã khử trùng. */
const queriesField = z
  .array(z.string().trim().min(1).max(100))
  .min(1, "Cần ít nhất một từ khóa")
  .max(20)
  .transform((arr) => [...new Set(arr)]);

export const DEFAULT_HITS_PER_PAGE = 100;
export const MAX_HITS_PER_PAGE = 100;
export const DEFAULT_MAX_PAGES = 3;
export const MAX_PAGES_LIMIT = 10;

/** Body tạo nguồn sync mới. */
export const createJobSyncSourceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  provider: jobSyncProviderSchema.default("vietnamworks"),
  queries: queriesField,
  filters: jobSyncFiltersSchema.default({ cityId: null, districtIds: [] }),
  hitsPerPage: z
    .number()
    .int()
    .min(1)
    .max(MAX_HITS_PER_PAGE)
    .default(DEFAULT_HITS_PER_PAGE),
  maxPages: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGES_LIMIT)
    .default(DEFAULT_MAX_PAGES),
  schedule: jobSyncScheduleSchema,
  enabled: z.boolean().default(true),
});
export type CreateJobSyncSourceInput = z.infer<
  typeof createJobSyncSourceInputSchema
>;

/** Body cập nhật nguồn sync (mọi trường tùy chọn). */
export const updateJobSyncSourceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    queries: queriesField,
    filters: jobSyncFiltersSchema,
    hitsPerPage: z.number().int().min(1).max(MAX_HITS_PER_PAGE),
    maxPages: z.number().int().min(1).max(MAX_PAGES_LIMIT),
    schedule: jobSyncScheduleSchema,
    enabled: z.boolean(),
  })
  .partial();
export type UpdateJobSyncSourceInput = z.infer<
  typeof updateJobSyncSourceInputSchema
>;

/** Trạng thái một lần chạy sync. */
export const jobSyncRunStatusSchema = z.enum([
  "running",
  "success",
  "partial",
  "error",
]);
export type JobSyncRunStatus = z.infer<typeof jobSyncRunStatusSchema>;

/** Nguồn kích hoạt run: theo lịch (cron) hay người dùng bấm "Chạy ngay". */
export const jobSyncTriggerSchema = z.enum(["schedule", "manual"]);
export type JobSyncTrigger = z.infer<typeof jobSyncTriggerSchema>;

/** DTO nguồn sync trả về client. */
export const jobSyncSourceSchema = z.object({
  id: idSchema,
  name: z.string(),
  provider: jobSyncProviderSchema,
  queries: z.array(z.string()),
  filters: jobSyncFiltersSchema,
  hitsPerPage: z.number().int(),
  maxPages: z.number().int(),
  schedule: jobSyncScheduleSchema,
  timezone: z.string(),
  enabled: z.boolean(),
  /** Trạng thái lần chạy gần nhất; null nếu chưa chạy bao giờ. */
  lastStatus: jobSyncRunStatusSchema.nullable(),
  lastRunAt: z.string().nullable(),
  /** Thời điểm dự kiến chạy kế tiếp (tính từ BullMQ); null nếu đang tắt. */
  nextRunAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobSyncSource = z.infer<typeof jobSyncSourceSchema>;

/** DTO một lần chạy sync (lịch sử). */
export const jobSyncRunSchema = z.object({
  id: idSchema,
  sourceId: idSchema.nullable(),
  /** Tên nguồn tại thời điểm chạy (giữ lại để lịch sử còn ý nghĩa khi nguồn bị xóa). */
  sourceName: z.string(),
  trigger: jobSyncTriggerSchema,
  status: jobSyncRunStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  pagesFetched: z.number().int().nonnegative(),
  jobsFound: z.number().int().nonnegative(),
  jobsCreated: z.number().int().nonnegative(),
  jobsUpdated: z.number().int().nonnegative(),
  jobsFailed: z.number().int().nonnegative(),
  queriesRun: z.array(z.string()),
  errorMessage: z.string().nullable(),
});
export type JobSyncRun = z.infer<typeof jobSyncRunSchema>;

export const jobSyncSourceListResponseSchema = z.array(jobSyncSourceSchema);
export type JobSyncSourceListResponse = z.infer<
  typeof jobSyncSourceListResponseSchema
>;

export const jobSyncRunListResponseSchema = z.array(jobSyncRunSchema);
export type JobSyncRunListResponse = z.infer<
  typeof jobSyncRunListResponseSchema
>;

/**
 * Tổng quan cho drawer + badge ở nút "Đồng bộ": danh sách nguồn, các lần chạy
 * gần đây, số run lỗi (badge) và số đang chạy. Gom vào một response để frontend
 * chỉ gọi một lần (chia sẻ cache giữa badge và drawer).
 */
export const jobSyncOverviewSchema = z.object({
  sources: z.array(jobSyncSourceSchema),
  recentRuns: z.array(jobSyncRunSchema),
  /** Số run "error" trong cửa sổ gần đây (dùng cho badge cảnh báo ở nút). */
  failedRuns: z.number().int().nonnegative(),
  runningRuns: z.number().int().nonnegative(),
});
export type JobSyncOverview = z.infer<typeof jobSyncOverviewSchema>;
