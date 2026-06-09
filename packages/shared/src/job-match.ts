import { z } from "zod";
import type { Job } from "./jobs.js";

/**
 * Barem chấm điểm job cá nhân hóa ("Matching Job").
 *
 * Đây là **nguồn điểm phù hợp duy nhất** của hệ thống: người dùng tự định nghĩa
 * trọng số và mong muốn, `scoreJob()` chấm mỗi job ra điểm 0–100 cùng phần giải
 * thích. Hàm là **thuần** (không phụ thuộc thời gian hệ thống — `nowMs` truyền
 * vào) nên đặt ở `shared` để frontend chấm trực tiếp, và có thể tái dùng ở
 * backend nếu sau này cần sắp xếp/lọc phía server.
 */

/** Trọng số tối đa của một tiêu chí (0 = tắt tiêu chí, 10 = quan trọng nhất). */
export const MAX_MATCH_WEIGHT = 10;

/** Trần cột `INT UNSIGNED` của MySQL — clamp lương mong muốn cho khớp DB. */
const MAX_SALARY = 4_294_967_295;

/** Điểm trừ trên thang 0–100 cho mỗi công nghệ "né tránh" mà job có. */
const AVOID_PENALTY_POINTS = 12;

/** Các tiêu chí có trọng số trong barem. */
export const jobMatchWeightKeys = [
  "tech",
  "salary",
  "level",
  "employmentType",
  "location",
  "freshness",
  "keyword",
] as const;
export type JobMatchWeightKey = (typeof jobMatchWeightKeys)[number];

/** Nhãn tiếng Việt của từng tiêu chí (dùng cho phần giải thích & UI cài đặt). */
export const MATCH_CRITERION_LABELS: Record<JobMatchWeightKey, string> = {
  tech: "Kỹ năng",
  salary: "Mức lương",
  level: "Cấp bậc",
  employmentType: "Hình thức",
  location: "Địa điểm",
  freshness: "Độ mới",
  keyword: "Từ khóa",
};

const weightField = z.number().int().min(0).max(MAX_MATCH_WEIGHT);

export const jobMatchWeightsSchema = z.object({
  tech: weightField,
  salary: weightField,
  level: weightField,
  employmentType: weightField,
  location: weightField,
  freshness: weightField,
  keyword: weightField,
});
export type JobMatchWeights = z.infer<typeof jobMatchWeightsSchema>;

const slugList = (max: number) =>
  z.array(z.string().trim().min(1).max(64)).max(max);
const textList = (max: number) =>
  z.array(z.string().trim().min(1).max(100)).max(max);
const nullableSalary = z.number().int().nonnegative().max(MAX_SALARY).nullable();

/**
 * Cấu hình barem của một người dùng. Lưu nguyên dạng JSON trong
 * `user_settings.job_match_prefs`. `enabled = false` → không chấm điểm, job hiển
 * thị như danh sách thường.
 */
export const jobMatchProfileSchema = z.object({
  enabled: z.boolean(),
  weights: jobMatchWeightsSchema,

  // Kỹ năng — lưu theo slug công nghệ (khớp `Job.techSlugs`).
  preferredTechs: slugList(100),
  avoidTechs: slugList(100),

  // Lương kỳ vọng (VND/tháng). `desiredSalary` đạt điểm tối đa; dưới `minSalary`
  // bị 0 điểm; ở giữa nội suy tuyến tính. `null` = không xét tiêu chí lương.
  desiredSalary: nullableSalary,
  minSalary: nullableSalary,

  preferredLevels: textList(20),
  preferredEmploymentTypes: textList(20),
  preferredLocations: textList(50),

  positiveKeywords: textList(50),
  negativeKeywords: textList(50),

  // Chu kỳ bán rã độ mới (ngày): job cũ bằng đúng số ngày này còn nửa điểm.
  freshnessHalfLifeDays: z.number().int().min(1).max(365),

  // Luật cứng — loại job khỏi danh sách (không chỉ giảm điểm).
  hideBelowMinSalary: z.boolean(),
  mustHaveTechs: slugList(50),
  hideMissingMustHave: z.boolean(),

  // Chỉ hiện job có điểm ≥ ngưỡng. `null` = hiện tất cả.
  minScore: z.number().int().min(0).max(100).nullable(),
});
export type JobMatchProfile = z.infer<typeof jobMatchProfileSchema>;

/** Barem mặc định: đã bật sẵn các tiêu chí phổ biến nhưng chưa có mong muốn nào. */
export const DEFAULT_JOB_MATCH_PROFILE: JobMatchProfile = {
  enabled: false,
  weights: {
    tech: 6,
    salary: 4,
    level: 3,
    employmentType: 2,
    location: 3,
    freshness: 2,
    keyword: 2,
  },
  preferredTechs: [],
  avoidTechs: [],
  desiredSalary: null,
  minSalary: null,
  preferredLevels: [],
  preferredEmploymentTypes: [],
  preferredLocations: [],
  positiveKeywords: [],
  negativeKeywords: [],
  freshnessHalfLifeDays: 14,
  hideBelowMinSalary: false,
  mustHaveTechs: [],
  hideMissingMustHave: false,
  minScore: null,
};

/** PUT /auth/settings/job-match nhận trọn cấu hình barem; response cũng là nó. */
export const updateJobMatchProfileInputSchema = jobMatchProfileSchema;
export type UpdateJobMatchProfileInput = z.infer<
  typeof updateJobMatchProfileInputSchema
>;

/**
 * Hợp nhất cấu hình đã lưu (có thể thiếu trường nếu barem được mở rộng sau này)
 * với mặc định, rồi validate. Đầu vào hỏng → trả về mặc định thay vì ném lỗi.
 */
export function normalizeJobMatchProfile(input: unknown): JobMatchProfile {
  const base = input && typeof input === "object" ? input : {};
  const merged = {
    ...DEFAULT_JOB_MATCH_PROFILE,
    ...(base as Record<string, unknown>),
    weights: {
      ...DEFAULT_JOB_MATCH_PROFILE.weights,
      ...((base as { weights?: Record<string, unknown> }).weights ?? {}),
    },
  };
  const parsed = jobMatchProfileSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_JOB_MATCH_PROFILE;
}

/* -------------------- Kết quả chấm điểm -------------------- */

export type JobMatchTier = "excellent" | "good" | "fair" | "low";

/** Một dòng đóng góp điểm để hiển thị "vì sao phù hợp". */
export interface JobMatchBreakdownItem {
  key: JobMatchWeightKey | "avoid";
  label: string;
  /** Điểm con 0–1 của tiêu chí (riêng "avoid" không dùng). */
  subScore: number;
  /** Điểm đóng góp vào tổng 0–100 (âm với "avoid"). */
  points: number;
  detail: string;
}

export interface JobMatchResult {
  /** Điểm phù hợp 0–100. */
  score: number;
  tier: JobMatchTier;
  /** Slug công nghệ khớp với mong muốn — để tô sáng trên thẻ job. */
  matchedTechs: string[];
  breakdown: JobMatchBreakdownItem[];
  /** Bị loại bởi luật cứng / ngưỡng điểm tối thiểu. */
  hidden: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Phân tầng điểm để gắn nhãn & tô màu. */
export function jobMatchTier(score: number): JobMatchTier {
  if (score >= 80) return "excellent";
  if (score >= 60) return "good";
  if (score >= 40) return "fair";
  return "low";
}

/** Lương đại diện (VND): ưu tiên trần, rồi sàn; không có → null (Thỏa thuận). */
function repSalary(job: Job): number | null {
  return job.salaryMax ?? job.salaryMin ?? null;
}

/** Mốc thời gian job (ms): ưu tiên ngày đăng, thiếu thì dùng thời điểm crawl. */
function jobTimeMs(job: Job): number {
  const t = new Date(job.postedAt ?? job.crawlAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Một tiêu chí áp dụng được, kèm điểm con và mô tả. */
interface Criterion {
  key: JobMatchWeightKey;
  applicable: boolean;
  sub: number;
  detail: string;
}

/**
 * Chấm điểm một job theo barem. Chỉ các tiêu chí **có trọng số > 0 và được cấu
 * hình** mới vào mẫu số (chuẩn hóa về 0–100), nên dữ liệu thiếu được chấm trung
 * tính chứ không bị dìm. `nowMs` là thời điểm hiện tại để tính độ mới.
 */
export function scoreJob(
  job: Job,
  profile: JobMatchProfile,
  nowMs: number,
): JobMatchResult {
  const jobSlugs = new Set(job.techSlugs);
  const matchedTechs = profile.preferredTechs.filter((s) => jobSlugs.has(s));

  const criteria: Criterion[] = [
    techCriterion(profile, matchedTechs),
    salaryCriterion(job, profile),
    levelCriterion(job, profile),
    employmentTypeCriterion(job, profile),
    locationCriterion(job, profile),
    freshnessCriterion(job, profile, nowMs),
    keywordCriterion(job, profile),
  ];

  let denom = 0;
  const active: Array<{ c: Criterion; weight: number }> = [];
  for (const c of criteria) {
    const weight = profile.weights[c.key];
    if (!c.applicable || weight <= 0) continue;
    denom += weight;
    active.push({ c, weight });
  }

  const breakdown: JobMatchBreakdownItem[] = [];
  let base = 0;
  for (const { c, weight } of active) {
    const points = denom > 0 ? (weight / denom) * 100 * c.sub : 0;
    base += points;
    breakdown.push({
      key: c.key,
      label: MATCH_CRITERION_LABELS[c.key],
      subScore: c.sub,
      points: Math.round(points),
      detail: c.detail,
    });
  }

  const avoidHits = profile.avoidTechs.filter((s) => jobSlugs.has(s));
  const avoidPenalty = avoidHits.length * AVOID_PENALTY_POINTS;
  if (avoidHits.length > 0) {
    breakdown.push({
      key: "avoid",
      label: "Công nghệ né tránh",
      subScore: 0,
      points: -avoidPenalty,
      detail: `${avoidHits.length} công nghệ cần tránh`,
    });
  }

  const score = Math.max(0, Math.min(100, Math.round(base - avoidPenalty)));

  return {
    score,
    tier: jobMatchTier(score),
    matchedTechs,
    breakdown,
    hidden: isHidden(job, profile, jobSlugs, score),
  };
}

function isHidden(
  job: Job,
  profile: JobMatchProfile,
  jobSlugs: Set<string>,
  score: number,
): boolean {
  if (profile.hideBelowMinSalary && profile.minSalary != null) {
    const rep = repSalary(job);
    if (rep != null && rep < profile.minSalary) return true;
  }
  if (profile.hideMissingMustHave && profile.mustHaveTechs.length > 0) {
    if (!profile.mustHaveTechs.every((s) => jobSlugs.has(s))) return true;
  }
  if (profile.minScore != null && score < profile.minScore) return true;
  return false;
}

/* -------------------- Tiêu chí -------------------- */

function techCriterion(
  profile: JobMatchProfile,
  matched: string[],
): Criterion {
  const total = profile.preferredTechs.length;
  return {
    key: "tech",
    applicable: total > 0,
    sub: total > 0 ? matched.length / total : 0,
    detail: `${matched.length}/${total} kỹ năng khớp`,
  };
}

function salaryCriterion(job: Job, profile: JobMatchProfile): Criterion {
  const desired = profile.desiredSalary;
  const rep = repSalary(job);
  let sub = 0.5;
  let detail = "Thỏa thuận — trung tính";
  if (desired != null && rep != null) {
    const floor = profile.minSalary ?? 0;
    if (rep >= desired) {
      sub = 1;
      detail = "Đạt mức mong muốn";
    } else if (rep <= floor) {
      sub = 0;
      detail = "Dưới mức sàn";
    } else {
      sub = clamp01((rep - floor) / Math.max(desired - floor, 1));
      detail = "Gần mức mong muốn";
    }
  }
  return { key: "salary", applicable: desired != null, sub, detail };
}

function levelCriterion(job: Job, profile: JobMatchProfile): Criterion {
  const wanted = profile.preferredLevels;
  const applicable = wanted.length > 0;
  if (!job.level) {
    return { key: "level", applicable, sub: 0.5, detail: "Không rõ cấp bậc" };
  }
  const hit = wanted.some((v) => v.toLowerCase() === job.level!.toLowerCase());
  return {
    key: "level",
    applicable,
    sub: hit ? 1 : 0,
    detail: hit ? `Khớp ${job.level}` : `Lệch (${job.level})`,
  };
}

function employmentTypeCriterion(
  job: Job,
  profile: JobMatchProfile,
): Criterion {
  const wanted = profile.preferredEmploymentTypes;
  const applicable = wanted.length > 0;
  const value = job.employmentType;
  if (!value) {
    return {
      key: "employmentType",
      applicable,
      sub: 0.5,
      detail: "Không rõ hình thức",
    };
  }
  const hit = wanted.some((v) => v.toLowerCase() === value.toLowerCase());
  return {
    key: "employmentType",
    applicable,
    sub: hit ? 1 : 0,
    detail: hit ? `Khớp ${value}` : `Lệch (${value})`,
  };
}

function locationCriterion(job: Job, profile: JobMatchProfile): Criterion {
  const wanted = profile.preferredLocations;
  const applicable = wanted.length > 0;
  if (!job.location) {
    return { key: "location", applicable, sub: 0.5, detail: "Không rõ địa điểm" };
  }
  const loc = job.location.toLowerCase();
  const hit = wanted.some((v) => loc.includes(v.toLowerCase()));
  return {
    key: "location",
    applicable,
    sub: hit ? 1 : 0,
    detail: hit ? `Khớp ${job.location}` : `Khác (${job.location})`,
  };
}

function freshnessCriterion(
  job: Job,
  profile: JobMatchProfile,
  nowMs: number,
): Criterion {
  const t = jobTimeMs(job);
  if (!t) {
    return { key: "freshness", applicable: true, sub: 0.5, detail: "Không rõ ngày" };
  }
  const ageDays = Math.max(0, (nowMs - t) / DAY_MS);
  const sub = clamp01(0.5 ** (ageDays / profile.freshnessHalfLifeDays));
  return {
    key: "freshness",
    applicable: true,
    sub,
    detail: `Đăng ${Math.round(ageDays)} ngày trước`,
  };
}

function keywordCriterion(job: Job, profile: JobMatchProfile): Criterion {
  const applicable =
    profile.positiveKeywords.length > 0 || profile.negativeKeywords.length > 0;
  const haystack = [
    job.title,
    job.description,
    job.company,
    ...job.techStack,
    ...job.requirements,
    ...job.responsibilities,
    ...job.benefits,
  ]
    .join(" \n ")
    .toLowerCase();

  const posHits = profile.positiveKeywords.filter((k) =>
    haystack.includes(k.toLowerCase()),
  );
  const negHits = profile.negativeKeywords.filter((k) =>
    haystack.includes(k.toLowerCase()),
  );

  const posScore = profile.positiveKeywords.length
    ? posHits.length / profile.positiveKeywords.length
    : 0.5;
  const negPenalty = profile.negativeKeywords.length
    ? negHits.length / profile.negativeKeywords.length
    : 0;

  return {
    key: "keyword",
    applicable,
    sub: clamp01(posScore - negPenalty),
    detail: `+${posHits.length} tốt · −${negHits.length} xấu`,
  };
}
