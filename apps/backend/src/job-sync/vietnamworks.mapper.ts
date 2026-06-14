/**
 * Map một job thô từ VietnamWorks public API sang body của `POST /jobs`
 * (IngestJobInput). Trả về object thô (chưa qua Zod) để service đưa thẳng vào
 * `JobsService.ingest`, nơi sẽ validate + upsert.
 *
 * Các trường mô tả/yêu cầu là HTML (kèm entity như `C&#43;&#43;`) → cần giải mã
 * entity, tách bullet, và lọc text sạch.
 */

const SOURCE = "vietnamworks";
/** Tiền tố `job_id` để không đụng id của nguồn khác trong bảng `jobs` chung. */
const JOB_ID_PREFIX = "vnw_";
const MAX_BULLETS = 200;
const MAX_BULLET_LEN = 500;

/** typeWorkingId → nhãn hình thức làm việc. Chỉ map giá trị chắc chắn. */
const WORKING_TYPE_LABELS: Record<number, string> = {
  1: "Toàn thời gian",
};

/** Object kết quả map — khớp các khóa mà `ingestJobInputSchema` mong đợi. */
export type MappedVietnamworksJob = Record<string, unknown>;

export function mapVietnamworksJob(raw: unknown): MappedVietnamworksJob | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const jobId = normalizeId(r.jobId);
  const title = str(r.jobTitle);
  // jobId + title là bắt buộc; thiếu một trong hai thì bỏ qua job này.
  if (!jobId || !title) return null;

  const salaryMin = positiveOrNull(r.salaryMin);
  const salaryMax = positiveOrNull(r.salaryMax);
  const hasSalary = salaryMin != null || salaryMax != null;

  return {
    jobId: `${JOB_ID_PREFIX}${jobId}`,
    jobUrl: str(r.jobUrl),
    source: SOURCE,
    title,
    company: str(r.companyName),
    companyLogo: str(r.companyLogo),
    location: pickLocation(r),

    salaryMin,
    salaryMax,
    // Chỉ gắn tiền tệ khi thật sự có số lương (tránh hiện "USD" với "Thỏa thuận").
    salaryCurrency: hasSalary ? str(r.salaryCurrency) || null : null,

    level: str(r.jobLevelVI) || str(r.jobLevel) || null,
    employmentType: workingTypeLabel(r.typeWorkingId),
    postedAt: str(r.approvedOn) || str(r.onlineOn) || str(r.createdOn) || null,
    deadline: str(r.expiredOn) || null,
    applicants: applicantsLabel(r.numOfApplications),

    techStack: skillNames(r.skills),
    requirements: htmlToBullets(str(r.jobRequirement)),
    responsibilities: htmlToBullets(str(r.jobDescription)),
    benefits: benefitLines(r.benefits),

    description: htmlToText(str(r.jobDescription)),
    fitScore: null,
    fitReason: null,
    // crawlAt = null → JobsService điền thời điểm hiện tại (lúc sync).
    crawlAt: null,
  };
}

/* -------------------- Field helpers -------------------- */

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return "";
}

function normalizeId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.trim();
  return "";
}

function positiveOrNull(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function workingTypeLabel(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) ? WORKING_TYPE_LABELS[n] ?? null : null;
}

function applicantsLabel(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${Math.round(n)} ứng viên`;
}

/** Lấy địa điểm hiển thị: ưu tiên tên thành phố (VI) của vị trí đầu, fallback address. */
function pickLocation(r: Record<string, unknown>): string {
  const locations = Array.isArray(r.workingLocations) ? r.workingLocations : [];
  for (const loc of locations) {
    if (loc && typeof loc === "object") {
      const l = loc as Record<string, unknown>;
      const city = str(l.cityNameVI) || str(l.cityName);
      if (city) return city;
    }
  }
  const first = locations[0];
  if (first && typeof first === "object") {
    const addr = str((first as Record<string, unknown>).address);
    if (addr) return addr;
  }
  return str(r.address);
}

function skillNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const skill of value) {
    if (skill && typeof skill === "object") {
      const name = str((skill as Record<string, unknown>).skillName);
      if (name) names.push(name);
    }
  }
  return names;
}

function benefitLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const benefit of value) {
    if (!benefit || typeof benefit !== "object") continue;
    const b = benefit as Record<string, unknown>;
    const label = str(b.benefitNameVI) || str(b.benefitName);
    const detail = str(b.benefitValue);
    if (label && detail) lines.push(`${label}: ${detail}`);
    else if (label) lines.push(label);
    else if (detail) lines.push(detail);
  }
  return lines;
}

/* -------------------- HTML helpers -------------------- */

/** Giải mã entity HTML phổ biến + dạng số (`&#43;` → "+", `&#x2B;` → "+"). */
export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      safeFromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      safeFromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function safeFromCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Chuyển HTML thành text thuần: thay ranh giới khối (`</p>`, `<br>`, `<li>`, …)
 * bằng xuống dòng, bỏ thẻ, giải mã entity, gom khoảng trắng.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(stripped)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/** Tách HTML thành các bullet sạch (bỏ ký hiệu đầu dòng, khử rỗng/trùng liền kề). */
export function htmlToBullets(html: string): string[] {
  const text = htmlToText(html);
  if (!text) return [];
  const bullets: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine
      .replace(/^[\s•●▪*+\-–—]+/, "")
      .trim()
      .slice(0, MAX_BULLET_LEN);
    if (!line) continue;
    if (bullets[bullets.length - 1] === line) continue; // bỏ trùng liền kề
    bullets.push(line);
    if (bullets.length >= MAX_BULLETS) break;
  }
  return bullets;
}
