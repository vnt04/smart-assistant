import { Injectable, Logger } from "@nestjs/common";
import type { JobSyncFilters } from "@assistant/shared";

/** Endpoint public job-search của VietnamWorks (cố định — không nhận từ input). */
const SEARCH_ENDPOINT = "https://ms.vietnamworks.com/job-search/v1.0/search";
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Các trường cần lấy về (khớp request thực tế của vietnamworks.com). Lấy đủ để
 * map sang job của hệ thống mà không gọi thêm API chi tiết.
 */
const RETRIEVE_FIELDS = [
  "address",
  "benefits",
  "jobTitle",
  "salaryMax",
  "isSalaryVisible",
  "jobLevelVI",
  "salaryMin",
  "companyLogo",
  "jobLevel",
  "jobLevelId",
  "jobId",
  "jobUrl",
  "companyId",
  "approvedOn",
  "isAnonymous",
  "alias",
  "expiredOn",
  "industriesV3",
  "workingLocations",
  "companyName",
  "salary",
  "onlineOn",
  "prettySalary",
  "skills",
  "jobDescription",
  "jobRequirement",
  "languageSelectedVI",
  "typeWorkingId",
  "createdOn",
  "salaryCurrency",
  "numOfApplications",
] as const;

export interface VietnamworksSearchParams {
  query: string;
  filters: JobSyncFilters;
  hitsPerPage: number;
  /** Trang bắt đầu từ 0. */
  page: number;
}

export interface VietnamworksSearchResult {
  /** Tổng số trang theo `hitsPerPage` (từ `meta.nbPages`). */
  nbPages: number;
  nbHits: number;
  /** Mảng job thô (chưa map). */
  items: unknown[];
}

/** Lỗi gọi VietnamWorks — mang `code` ổn định để service ghi vào lịch sử run. */
export class VietnamworksError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "VietnamworksError";
  }
}

/**
 * Client gọi public API tìm việc của VietnamWorks. Gửi kèm các header giống
 * trình duyệt (user-agent/origin/referer/x-source) để không bị chặn. URL là hằng
 * số nên không có rủi ro SSRF từ input người dùng.
 */
@Injectable()
export class VietnamworksClient {
  private readonly logger = new Logger(VietnamworksClient.name);

  async search(
    params: VietnamworksSearchParams,
  ): Promise<VietnamworksSearchResult> {
    const body = buildSearchBody(params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          accept: "*/*",
          "accept-language": "vi",
          "content-type": "application/json",
          origin: "https://www.vietnamworks.com",
          referer: "https://www.vietnamworks.com/",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
          "x-source": "Page-Container",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await safeBody(res);
        this.logger.warn(
          `VietnamWorks search → ${res.status}: ${detail}`,
        );
        throw new VietnamworksError(
          `VietnamWorks trả về lỗi (${res.status}).`,
          "vietnamworks_http_error",
        );
      }

      const json: unknown = await res.json();
      return parseSearchResponse(json);
    } catch (error: unknown) {
      if (error instanceof VietnamworksError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new VietnamworksError(
          "VietnamWorks không phản hồi (quá thời gian chờ).",
          "vietnamworks_timeout",
        );
      }
      throw new VietnamworksError(
        `Không kết nối được VietnamWorks: ${describe(error)}`,
        "vietnamworks_unreachable",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Dựng body tìm kiếm khớp định dạng VietnamWorks (filter địa điểm là chuỗi JSON). */
export function buildSearchBody(
  params: VietnamworksSearchParams,
): Record<string, unknown> {
  const { query, filters, hitsPerPage, page } = params;
  const filter: Array<{ field: string; value: string }> = [];

  if (filters.cityId != null) {
    filter.push({
      field: "workingLocations.cityId",
      value: String(filters.cityId),
    });
    // VietnamWorks bọc districtId dưới dạng chuỗi JSON. `[-1]` = mọi quận/huyện.
    const districtId = filters.districtIds.length > 0 ? filters.districtIds : [-1];
    filter.push({
      field: "workingLocations.districtId",
      value: JSON.stringify([{ cityId: filters.cityId, districtId }]),
    });
  }

  return {
    userId: 0,
    query,
    filter,
    ranges: [],
    order: [],
    hitsPerPage,
    page,
    retrieveFields: [...RETRIEVE_FIELDS],
    summaryVersion: "",
  };
}

/** Bóc `meta.nbPages/nbHits` và mảng `data` từ response; thiếu → mặc định an toàn. */
function parseSearchResponse(json: unknown): VietnamworksSearchResult {
  if (!json || typeof json !== "object") {
    return { nbPages: 0, nbHits: 0, items: [] };
  }
  const obj = json as { meta?: unknown; data?: unknown };
  const meta =
    obj.meta && typeof obj.meta === "object"
      ? (obj.meta as { nbPages?: unknown; nbHits?: unknown })
      : {};
  const items = Array.isArray(obj.data) ? obj.data : [];
  return {
    nbPages: toCount(meta.nbPages),
    nbHits: toCount(meta.nbHits),
    items,
  };
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "lỗi không xác định";
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "<không đọc được body>";
  }
}
