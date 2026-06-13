import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  n8nExecutionStatusSchema,
  type N8nExecution,
  type N8nExecutionDetail,
  type N8nExecutionError,
  type N8nExecutionListResponse,
  type N8nExecutionStats,
  type N8nExecutionStatus,
  type N8nExecutionStatusCounts,
  type N8nExecutionTag,
  type N8nRetryResponse,
} from "@assistant/shared";
import { SettingsService, type N8nConfig } from "../settings/settings.service";

const REQUEST_TIMEOUT_MS = 15_000;
/**
 * Retry chạy ĐỒNG BỘ phía n8n (chỉ trả lời khi workflow chạy xong). Cho phép
 * chờ rất lâu ở tầng backend→n8n (server-to-server, không qua Nginx) thay vì
 * cắt sớm như các request thường.
 */
const RETRY_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * Thời gian "ân hạn" chờ retry chạy xong trước khi trả "accepted" cho client.
 * Đủ để bắt lỗi nhanh (key sai/không retry được) nhưng vẫn dưới timeout của
 * Nginx (60s) để response backend→frontend không bị cắt với workflow chạy lâu.
 */
export const RETRY_GRACE_MS = 12_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const WORKFLOW_FETCH_LIMIT = 250;
const WORKFLOW_NAME_TTL_MS = 5 * 60 * 1000;
/** Trần kích thước JSON dữ liệu execution trả cho client (cắt bớt nếu vượt). */
const MAX_DATA_JSON_CHARS = 300_000;
/** Thống kê: cỡ mỗi trang khi quét, và trần số trang (để không quét vô hạn). */
const STATS_PAGE_SIZE = 250;
const STATS_MAX_PAGES = 40;
/** Cache thống kê theo user — quét phân trang khá nặng, tránh gọi n8n liên tục. */
const STATS_TTL_MS = 30 * 1000;

interface N8nRequest {
  method: "GET" | "POST" | "DELETE";
  body?: unknown;
  /** Ghi đè timeout (ms); mặc định REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
}

interface WorkflowNameCache {
  names: Map<string, string>;
  expiresAt: number;
}

interface StatsCache {
  stats: N8nExecutionStats;
  expiresAt: number;
}

/**
 * Proxy public API của n8n (`/api/v1/...`) bằng API key (header `X-N8N-API-KEY`)
 * lưu trong settings của user. Proxy ở backend vì API key là bí mật (đã mã hóa).
 *
 * Lưu ý: KHÔNG bao giờ ném 401 ra cho frontend — interceptor của app sẽ tưởng
 * access token hết hạn rồi refresh/đăng xuất nhầm. API key hỏng → trả 400.
 */
@Injectable()
export class N8nService {
  private readonly logger = new Logger(N8nService.name);
  /** Cache tên workflow theo user (executions chỉ trả workflowId, không trả tên). */
  private readonly workflowNames = new Map<string, WorkflowNameCache>();
  /** Cache thống kê theo user (quét phân trang nặng → TTL ngắn, xem STATS_TTL_MS). */
  private readonly statsByUser = new Map<string, StatsCache>();

  constructor(private readonly settings: SettingsService) {}

  async listExecutions(
    userId: string,
    limit = DEFAULT_LIMIT,
  ): Promise<N8nExecutionListResponse> {
    const cfg = await this.requireConfig(userId);
    const safeLimit = clampLimit(limit);

    const [names, raw] = await Promise.all([
      this.getWorkflowNames(userId, cfg),
      this.request(cfg, `/api/v1/executions?limit=${safeLimit}`, {
        method: "GET",
      }),
    ]);

    const results = unwrapList(raw)
      .map(mapExecution)
      .filter((e): e is N8nExecution => e !== null)
      .map((e) => ({
        ...e,
        workflowName:
          e.workflowName ??
          (e.workflowId ? names.get(e.workflowId) ?? null : null),
      }));

    return { results, count: results.length };
  }

  /**
   * Thống kê execution trên TOÀN BỘ (không giới hạn theo trang đang xem): quét
   * phân trang qua n8n bằng `nextCursor`, đếm theo trạng thái. Kết quả cache ngắn
   * (STATS_TTL_MS) vì frontend gọi định kỳ (badge ở nút + drawer tự làm mới).
   *
   * Quét tối đa STATS_MAX_PAGES trang; nếu vẫn còn → `truncated = true` (con số là
   * tối thiểu). Chỉ lấy danh sách (không `includeData`) nên payload mỗi trang nhẹ.
   */
  async getExecutionStats(userId: string): Promise<N8nExecutionStats> {
    const cached = this.statsByUser.get(userId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.stats;

    const cfg = await this.requireConfig(userId);
    const counts = emptyStatusCounts();
    let total = 0;
    let truncated = false;
    let cursor: string | null = null;
    let page = 0;

    do {
      const qs =
        `?limit=${STATS_PAGE_SIZE}` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const raw = await this.request(cfg, `/api/v1/executions${qs}`, {
        method: "GET",
      });

      for (const item of unwrapList(raw)) {
        const exec = mapExecution(item);
        if (!exec) continue;
        counts[exec.status] += 1;
        total += 1;
      }

      cursor = pickNextCursor(raw);
      page += 1;
      if (cursor && page >= STATS_MAX_PAGES) {
        truncated = true;
        cursor = null;
      }
    } while (cursor);

    const stats: N8nExecutionStats = {
      total,
      byStatus: counts,
      failed: counts.error + counts.crashed,
      truncated,
    };
    this.statsByUser.set(userId, { stats, expiresAt: now + STATS_TTL_MS });
    return stats;
  }

  /**
   * Chạy lại một execution. n8n public API chạy retry ĐỒNG BỘ: chỉ phản hồi khi
   * workflow chạy xong (có thể vài phút). Nếu chặn theo nó, request sẽ vượt
   * timeout của Nginx/Node và làm spinner kẹt — dù retry thực ra đã chạy.
   *
   * Vì vậy: phát yêu cầu với timeout dài, nhưng chỉ CHỜ một khoảng ân hạn ngắn.
   * - Xong trong thời gian chờ → trả "completed" kèm id lần chạy mới.
   * - Lỗi nhanh (key sai/không retry được) → ném lỗi ngay để báo người dùng.
   * - Vẫn đang chạy → trả "accepted", để retry chạy nền (chỉ log kết quả),
   *   người dùng theo dõi tiến trình ở danh sách (tự làm mới).
   */
  async retryExecution(
    userId: string,
    id: string,
    loadWorkflow: boolean,
  ): Promise<N8nRetryResponse> {
    const cfg = await this.requireConfig(userId);
    const pending = this.request(
      cfg,
      `/api/v1/executions/${encodeURIComponent(id)}/retry`,
      { method: "POST", body: { loadWorkflow }, timeoutMs: RETRY_TIMEOUT_MS },
    );

    const TIMED_OUT = Symbol("retry_grace");
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<typeof TIMED_OUT>((resolve) => {
      graceTimer = setTimeout(() => resolve(TIMED_OUT), RETRY_GRACE_MS);
    });

    try {
      // Lỗi nhanh sẽ làm `pending` reject trước → propagate ra ngoài.
      const outcome = await Promise.race([pending, grace]);
      // Tới đây là retry đã phát đi (không fast-fail) → có lần chạy mới.
      this.statsByUser.delete(userId);
      if (outcome === TIMED_OUT) {
        // Còn đang chạy: để chạy nền, chỉ log (tránh unhandled rejection).
        void pending.then(
          () => this.logger.log(`Retry execution ${id} hoàn tất.`),
          (error: unknown) =>
            this.logger.warn(`Retry execution ${id} nền lỗi: ${String(error)}`),
        );
        return { ok: true, executionId: null, status: "accepted" };
      }

      // Public API single-resource trả về object execution trực tiếp (không bọc).
      const executionId =
        outcome && typeof outcome === "object" && "id" in outcome
          ? String((outcome as { id: unknown }).id)
          : null;
      return { ok: true, executionId, status: "completed" };
    } finally {
      clearTimeout(graceTimer);
    }
  }

  async deleteExecution(userId: string, id: string): Promise<void> {
    const cfg = await this.requireConfig(userId);
    await this.request(cfg, `/api/v1/executions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    this.statsByUser.delete(userId); // tổng/đếm đã đổi → buộc tính lại
  }

  /** Dừng một execution đang chạy/chờ. */
  async stopExecution(userId: string, id: string): Promise<void> {
    const cfg = await this.requireConfig(userId);
    await this.request(
      cfg,
      `/api/v1/executions/${encodeURIComponent(id)}/stop`,
      { method: "POST" },
    );
    this.statsByUser.delete(userId); // trạng thái đã đổi → buộc tính lại
  }

  /** Chi tiết execution: kèm dữ liệu thô, lỗi đã trích, và tags. */
  async getExecution(userId: string, id: string): Promise<N8nExecutionDetail> {
    const cfg = await this.requireConfig(userId);
    const encoded = encodeURIComponent(id);

    const [names, raw, tags] = await Promise.all([
      this.getWorkflowNames(userId, cfg),
      this.request(cfg, `/api/v1/executions/${encoded}?includeData=true`, {
        method: "GET",
      }),
      this.fetchTags(cfg, encoded),
    ]);

    const base = mapExecution(raw);
    if (!base) {
      throw new ServiceUnavailableException({
        code: "n8n_error",
        message: "n8n trả về dữ liệu execution không hợp lệ.",
      });
    }

    const data =
      raw && typeof raw === "object" ? (raw as { data?: unknown }).data : null;
    return {
      ...base,
      workflowName:
        base.workflowName ??
        (base.workflowId ? names.get(base.workflowId) ?? null : null),
      error: extractError(data),
      tags,
      dataJson: capJson(data),
    };
  }

  /** Tags của execution; lỗi (vd thiếu quyền) → mảng rỗng, không làm hỏng chi tiết. */
  private async fetchTags(
    cfg: N8nConfig,
    encodedId: string,
  ): Promise<N8nExecutionTag[]> {
    try {
      const raw = await this.request(
        cfg,
        `/api/v1/executions/${encodedId}/tags`,
        { method: "GET" },
      );
      return unwrapList(raw)
        .map(mapTag)
        .filter((t): t is N8nExecutionTag => t !== null);
    } catch (error: unknown) {
      this.logger.warn(`Không lấy được tags execution: ${String(error)}`);
      return [];
    }
  }

  private async requireConfig(userId: string): Promise<N8nConfig> {
    const cfg = await this.settings.getN8nConfig(userId);
    if (!cfg) {
      throw new BadRequestException({
        code: "n8n_not_configured",
        message:
          "Chưa cấu hình n8n. Vui lòng nhập Base URL và API key n8n trong Cài đặt.",
      });
    }
    return cfg;
  }

  /** Map workflowId → tên (cache 5 phút). Lỗi khi lấy tên không làm hỏng list. */
  private async getWorkflowNames(
    userId: string,
    cfg: N8nConfig,
  ): Promise<Map<string, string>> {
    const cached = this.workflowNames.get(userId);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.names;

    const names = new Map<string, string>();
    try {
      const raw = await this.request(
        cfg,
        `/api/v1/workflows?limit=${WORKFLOW_FETCH_LIMIT}`,
        { method: "GET" },
      );
      for (const wf of unwrapList(raw)) {
        if (wf && typeof wf === "object") {
          const w = wf as Record<string, unknown>;
          if (w.id != null && typeof w.name === "string") {
            names.set(String(w.id), w.name);
          }
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Không lấy được tên workflow: ${String(error)}`);
    }

    this.workflowNames.set(userId, {
      names,
      expiresAt: now + WORKFLOW_NAME_TTL_MS,
    });
    return names;
  }

  private async request(
    cfg: N8nConfig,
    path: string,
    init: N8nRequest,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      init.timeoutMs ?? REQUEST_TIMEOUT_MS,
    );
    const headers: Record<string, string> = {
      accept: "application/json",
      "X-N8N-API-KEY": cfg.apiKey,
    };
    if (init.body !== undefined) headers["content-type"] = "application/json";

    try {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        // Cố tình KHÔNG dùng 401 — xem ghi chú ở đầu class.
        throw new BadRequestException({
          code: "n8n_unauthorized",
          message:
            "API key n8n không hợp lệ hoặc thiếu quyền. Cập nhật lại trong Cài đặt.",
        });
      }
      if (!res.ok) {
        const detail = await safeBody(res);
        this.logger.warn(`n8n ${init.method} ${path} → ${res.status}: ${detail}`);
        throw new ServiceUnavailableException({
          code: "n8n_error",
          message: `n8n trả về lỗi (${res.status}).`,
        });
      }

      const text = await res.text();
      return text ? (JSON.parse(text) as unknown) : null;
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new ServiceUnavailableException({
          code: "n8n_timeout",
          message: "n8n không phản hồi (quá thời gian chờ).",
        });
      }
      this.logger.error(`n8n ${init.method} ${path} thất bại: ${String(error)}`);
      throw new ServiceUnavailableException({
        code: "n8n_unreachable",
        message:
          "Không kết nối được tới n8n. Kiểm tra lại Base URL trong Cài đặt.",
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Bản đếm trạng thái khởi tạo 0 cho mọi key (dùng cho thống kê). */
function emptyStatusCounts(): N8nExecutionStatusCounts {
  return {
    new: 0,
    running: 0,
    waiting: 0,
    success: 0,
    error: 0,
    canceled: 0,
    crashed: 0,
    unknown: 0,
  };
}

/** Con trỏ trang kế của collection public API (`{ data, nextCursor }`); hết → null. */
function pickNextCursor(raw: unknown): string | null {
  if (raw && typeof raw === "object") {
    const cursor = (raw as { nextCursor?: unknown }).nextCursor;
    if (typeof cursor === "string" && cursor) return cursor;
  }
  return null;
}

/** n8n giới hạn số bản ghi: clamp về [1, MAX_LIMIT], mặc định DEFAULT_LIMIT. */
function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/**
 * Lấy mảng từ payload public API. Collection bọc trong `{ data: [...], nextCursor }`;
 * cũng chấp nhận mảng trần hoặc `{ results: [...] }` để phòng khác biệt phiên bản.
 * KHÔNG bóc khi `data` là object (object execution đơn lẻ cũng có field `data`).
 */
function unwrapList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as { data?: unknown; results?: unknown };
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.results)) return obj.results;
  }
  return [];
}

/** Chuẩn hóa một execution thô của n8n về DTO; thiếu id → bỏ. */
function mapExecution(raw: unknown): N8nExecution | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.id == null) return null;

  const startedAt = toIso(r.startedAt);
  const stoppedAt = toIso(r.stoppedAt);
  return {
    id: String(r.id),
    workflowId: r.workflowId != null ? String(r.workflowId) : null,
    workflowName: pickWorkflowName(r),
    status: normalizeStatus(r),
    mode: typeof r.mode === "string" ? r.mode : null,
    retryOf: r.retryOf != null ? String(r.retryOf) : null,
    retrySuccessId: r.retrySuccessId != null ? String(r.retrySuccessId) : null,
    startedAt,
    stoppedAt,
    createdAt: toIso(r.createdAt),
    runTimeMs: computeRunTime(startedAt, stoppedAt),
    finished: Boolean(r.finished),
  };
}

function pickWorkflowName(r: Record<string, unknown>): string | null {
  if (typeof r.workflowName === "string") return r.workflowName;
  const data = r.workflowData;
  if (
    data &&
    typeof data === "object" &&
    typeof (data as { name?: unknown }).name === "string"
  ) {
    return (data as { name: string }).name;
  }
  return null;
}

function normalizeStatus(r: Record<string, unknown>): N8nExecutionStatus {
  const parsed = n8nExecutionStatusSchema.safeParse(r.status);
  if (parsed.success) return parsed.data;
  // Phòng khi thiếu `status`: suy ra từ finished/stoppedAt.
  if (r.finished === true) return "success";
  if (r.stoppedAt == null) return "running";
  return "unknown";
}

function computeRunTime(
  startedAt: string | null,
  stoppedAt: string | null,
): number | null {
  if (!startedAt || !stoppedAt) return null;
  const ms = new Date(stoppedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapTag(raw: unknown): N8nExecutionTag | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (t.id == null || typeof t.name !== "string") return null;
  return { id: String(t.id), name: t.name };
}

/** Trích lỗi từ `data.resultData.error` (nếu execution thất bại). */
function extractError(data: unknown): N8nExecutionError | null {
  if (!data || typeof data !== "object") return null;
  const resultData = (data as { resultData?: unknown }).resultData;
  if (!resultData || typeof resultData !== "object") return null;
  const rd = resultData as Record<string, unknown>;
  const err = rd.error;
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;

  const node = e.node;
  const nodeName =
    node && typeof node === "object" && typeof (node as { name?: unknown }).name === "string"
      ? (node as { name: string }).name
      : typeof rd.lastNodeExecuted === "string"
        ? rd.lastNodeExecuted
        : null;

  return {
    message:
      typeof e.message === "string" && e.message.trim()
        ? e.message
        : "Lỗi không xác định",
    nodeName,
    stack: typeof e.stack === "string" ? e.stack : null,
  };
}

/** JSON-pretty dữ liệu execution, cắt bớt nếu quá dài; rỗng → null. */
function capJson(data: unknown): string | null {
  if (data == null) return null;
  let text: string;
  try {
    text = JSON.stringify(data, null, 2);
  } catch {
    return null;
  }
  if (!text || text === "{}" || text === "null") return null;
  return text.length > MAX_DATA_JSON_CHARS
    ? `${text.slice(0, MAX_DATA_JSON_CHARS)}\n… (đã cắt bớt)`
    : text;
}

async function safeBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 200);
  } catch {
    return "<không đọc được body>";
  }
}
