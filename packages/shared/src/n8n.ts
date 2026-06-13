import { z } from "zod";

/**
 * Quản lý workflow executions của n8n (xem ở view Jobs). Backend proxy gọi REST
 * nội bộ của n8n bằng cookie `n8n-auth`, chuẩn hóa về các DTO dưới đây; frontend
 * parse lại để bắt lệch hợp đồng.
 */

/** Trạng thái execution của n8n đã chuẩn hóa. `unknown` cho giá trị lạ. */
export const n8nExecutionStatusSchema = z.enum([
  "new",
  "running",
  "waiting",
  "success",
  "error",
  "canceled",
  "crashed",
  "unknown",
]);
export type N8nExecutionStatus = z.infer<typeof n8nExecutionStatusSchema>;

/** Một lần chạy workflow, đã chuẩn hóa từ payload n8n. */
export const n8nExecutionSchema = z.object({
  id: z.string(),
  workflowId: z.string().nullable(),
  workflowName: z.string().nullable(),
  status: n8nExecutionStatusSchema,
  mode: z.string().nullable(),
  /** Execution gốc mà lần chạy này retry lại (cột "Retry of X"). */
  retryOf: z.string().nullable(),
  /** Execution retry đã thành công thay cho lần chạy lỗi này ("Success retry X"). */
  retrySuccessId: z.string().nullable(),
  startedAt: z.string().nullable(),
  stoppedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  /** Thời gian chạy (ms) = stoppedAt − startedAt; đang chạy/chưa xong → null. */
  runTimeMs: z.number().int().nonnegative().nullable(),
  finished: z.boolean(),
});
export type N8nExecution = z.infer<typeof n8nExecutionSchema>;

/** Response GET /n8n/executions — mới nhất trước. */
export const n8nExecutionListResponseSchema = z.object({
  results: z.array(n8nExecutionSchema),
  count: z.number().int().nonnegative(),
});
export type N8nExecutionListResponse = z.infer<
  typeof n8nExecutionListResponseSchema
>;

/** Số lần chạy theo từng trạng thái (đủ mọi key, đếm trên toàn bộ executions). */
export const n8nExecutionStatusCountsSchema = z.object({
  new: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  success: z.number().int().nonnegative(),
  error: z.number().int().nonnegative(),
  canceled: z.number().int().nonnegative(),
  crashed: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});
export type N8nExecutionStatusCounts = z.infer<
  typeof n8nExecutionStatusCountsSchema
>;

/**
 * Thống kê execution trên TOÀN BỘ (không phải trang đang xem): tổng số, số theo
 * từng trạng thái, và `failed` (= error + crashed) để hiển thị badge ở nút. Số
 * liệu lấy bằng cách quét phân trang qua n8n; `truncated` = true khi vượt trần
 * quét nên các con số là tối thiểu.
 */
export const n8nExecutionStatsSchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: n8nExecutionStatusCountsSchema,
  failed: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type N8nExecutionStats = z.infer<typeof n8nExecutionStatsSchema>;

/** Tag chú thích (annotation tag) gắn trên execution. */
export const n8nExecutionTagSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type N8nExecutionTag = z.infer<typeof n8nExecutionTagSchema>;

/** Lỗi của execution (trích từ data.resultData.error) để hiển thị nhanh. */
export const n8nExecutionErrorSchema = z.object({
  message: z.string(),
  nodeName: z.string().nullable(),
  stack: z.string().nullable(),
});
export type N8nExecutionError = z.infer<typeof n8nExecutionErrorSchema>;

/**
 * Chi tiết một execution: các trường tóm tắt + lỗi (nếu có), tags, và `dataJson`
 * là dữ liệu thô đã JSON-pretty (cắt bớt nếu quá dài) cho phần xem chi tiết.
 */
export const n8nExecutionDetailSchema = n8nExecutionSchema.extend({
  error: n8nExecutionErrorSchema.nullable(),
  tags: z.array(n8nExecutionTagSchema),
  dataJson: z.string().nullable(),
});
export type N8nExecutionDetail = z.infer<typeof n8nExecutionDetailSchema>;

/**
 * Body retry: `loadWorkflow` chọn dùng workflow gốc tại thời điểm chạy (true)
 * hay workflow đang lưu hiện tại (false — mặc định).
 */
export const retryExecutionInputSchema = z
  .object({
    loadWorkflow: z.boolean().default(false),
  })
  .strict();
export type RetryExecutionInput = z.infer<typeof retryExecutionInputSchema>;

/**
 * Kết quả retry. n8n chạy retry ĐỒNG BỘ (chỉ trả lời khi workflow chạy xong, có
 * thể vài phút) nên backend không chặn theo nó:
 * - `status: "completed"` — chạy xong nhanh trong thời gian chờ; `executionId`
 *   là id lần chạy mới (nếu n8n trả về).
 * - `status: "accepted"` — workflow chạy lâu, đã được gửi và đang chạy nền;
 *   `executionId` = null, theo dõi tiến trình ở danh sách (tự làm mới).
 */
export const n8nRetryResponseSchema = z.object({
  ok: z.boolean(),
  executionId: z.string().nullable(),
  status: z.enum(["completed", "accepted"]),
});
export type N8nRetryResponse = z.infer<typeof n8nRetryResponseSchema>;
