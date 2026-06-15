# Implement Plan — Server-side Pagination cho Jobs

> **Trạng thái:** Draft để code ngày mai (2026-06-17). Sinh ra từ phiên khảo sát code 2026-06-16.
> **Phạm vi:** Thêm phân trang phía server (số trang 1,2,3) cho danh sách Jobs (`JobPage`), **full server-side**: lọc + sắp xếp + chấm điểm "Phù hợp với tôi" + facet + thống kê đều chuyển xuống backend.
> **Tài liệu bắt buộc đọc trước khi code:** `docs/modules/jobs/README.md`, `docs/architecture/backend.md`, `docs/architecture/frontend.md`. Quy ước doc trong `docs/CLAUDE.md`.

---

## 0. Bối cảnh & quyết định đã chốt

**Yêu cầu gốc:** "Ở view jobs, dữ liệu đổ ra chưa có phân trang. Muốn phát triển tính năng đó."

**Hiện trạng (đã khảo sát):**
- `GET /jobs` (công khai, không auth, bảng `jobs` global không có `user_id`) trả **toàn bộ** `Job[]`, sắp `crawlAt DESC`, chỉ lọc server theo `?tech=`.
- `JobPage.tsx` tải hết 1 lần rồi làm **mọi thứ client-side**: search, lọc (cấp bậc/lương/hình thức/ngày đăng/nguồn/địa điểm/công nghệ/điểm tối thiểu), sắp xếp (match/crawl/posted/salary), **chấm điểm `scoreJob`**, thống kê (StatsBar), đếm facet (rail) — tất cả cần đủ tập dữ liệu.
- `JobStatsPage.tsx` (`/job/stats`) **cũng** gọi `api.listJobs([])` và **bắt buộc cần toàn bộ job** (xu hướng 30 ngày, phân bổ lương, top công ty/công nghệ, tầng độ phù hợp). → **Không được phân trang trang này.**
- Repo đã có hạ tầng phân trang: `paginationQuerySchema` + `paginationMetaSchema` trong `packages/shared/src/common.ts`; `notes`/`transactions` dùng envelope `{items, meta}` ở backend. **Nhưng frontend chưa có UI phân trang nào** (NotesPage chỉ lấy `page:1` với `limit` lớn) → không có component số trang để tái dùng, ta tự dựng.

**Quyết định người dùng (qua AskUserQuestion):**
1. Phân trang **phía server (page/limit)** — KHÔNG phải client windowing.
2. Giao diện **số trang 1,2,3** — không phải "Xem thêm"/infinite scroll.
3. Sort "Phù hợp với tôi": **Full server-side** — backend import `scoreJob`, chấm điểm toàn bộ rồi cắt trang.

**Quyết định cơ chế (kỹ sư tự chọn — tránh breaking change & coupling):**
- **Giữ nguyên `GET /jobs` → `Job[]`** để `JobStatsPage` không đổi gì.
- **Thêm `POST /jobs/search` → `{items, meta, summary}`** cho `JobPage`. Dùng **POST** vì barem (`JobMatchProfile`) là object lồng nhau, không hợp lý nhét query string; giữ endpoint **công khai/stateless** (đúng thiết kế "jobs là bảng global, không user_id") → không thêm auth, không coupling jobs→settings.
- **Thêm `GET /jobs/facets` → {levels, employmentTypes, sources, locations, tech}** (đếm global) cho rail + editor. Frontend fetch 1 lần.
- Backend chấm điểm chỉ để **xác định thứ tự + ẩn + trang đúng**; client **chấm lại ≤ `limit` item của trang** để vẽ MatchBadge/breakdown (giữ nguyên path hiển thị hiện có). Cả 2 dùng chung `scoreJob` từ `@assistant/shared`.

**Điểm mấu chốt kỹ thuật:** `scoreJob` là JS thuần phức tạp (suy giảm độ mới, tỉ lệ kỹ năng, match từ khóa trong mô tả) → **không biểu diễn được bằng SQL**. Khi bật barem, backend **buộc phải nạp cả tập đã lọc, chấm điểm bằng JS rồi mới cắt trang** (server-side pagination khi đó chỉ giảm payload xuống client, không giảm tải DB). Khi tắt barem (mặc định), dùng SQL `LIMIT/OFFSET` thuần.

**GitNexus impact (đã chạy):** rủi ro code-graph `LOW`. `jobListResponseSchema`: 0 dependent graph. `JobsService.list`: 1 caller trực tiếp (`JobsController.list`), 2 process (`List → ToDto`, `List → TechPairs`). Vì ta **không sửa** `list`/`jobListResponseSchema` (chỉ thêm mới) nên blast radius gần như chỉ là code mới + `JobPage` + `api.ts`.

---

## 1. Files sẽ đụng

| File | Hành động |
|------|-----------|
| `packages/shared/src/jobs.ts` | **Thêm** schema search/facets (không sửa schema cũ) |
| `packages/shared/src/index.ts` | Không cần sửa — đã `export * from "./jobs.js"` |
| `apps/backend/src/jobs/jobs.service.ts` | **Thêm** `search()`, `listFacets()` + helpers |
| `apps/backend/src/jobs/jobs.controller.ts` | **Thêm** `POST /jobs/search`, `GET /jobs/facets` |
| `apps/backend/src/jobs/jobs.service.spec.ts` | **Tạo mới** (unit test helper thuần) |
| `apps/frontend/src/lib/api.ts` | **Thêm** `searchJobs`, `listJobFacets` |
| `apps/frontend/src/pages/JobPage.tsx` | **Sửa lớn** phần data-flow + thêm UI số trang |
| `apps/frontend/src/pages/JobStatsPage.tsx` | **Không đổi** (vẫn `listJobs([])`) |
| `docs/modules/jobs/README.md` | Cập nhật + Document History |

> Build order quan trọng: **shared → backend → frontend**. Sau khi sửa shared phải `pnpm --filter @assistant/shared build` (hoặc chạy `pnpm dev:shared` watch) thì backend/frontend mới thấy type mới.

---

## 2. Shared contract — `packages/shared/src/jobs.ts`

Thêm import ở đầu file (cạnh `import { idSchema } from "./common.js";`):

```ts
import { z } from "zod";
import { idSchema, paginationMetaSchema } from "./common.js";
import { jobMatchProfileSchema } from "./job-match.js";
```

> **Lưu ý vòng lặp import:** `job-match.ts` chỉ `import type { Job } from "./jobs.js"` (type-only → bị xóa khi compile) nên ở runtime **không có cạnh** job-match → jobs. Việc `jobs.ts` import **giá trị** `jobMatchProfileSchema` từ `job-match.ts` tạo graph runtime một chiều `jobs → job-match` (acyclic). An toàn. (Đã xác nhận; vẫn verify lại khi build.)

Thêm các schema sau (đặt cuối file, sau `techFacetListResponseSchema`):

```ts
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
 * Tham số POST /jobs/search. Mảng (tech/level/...) = chọn nhiều (OR trong nhóm).
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

/** Tóm tắt thống kê cho StatsBar (tính trên tập ĐÃ LỌC, không phải 1 trang). */
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

/** Response POST /jobs/search. `items` là 1 trang; `summary` trên cả tập lọc. */
export const jobSearchResponseSchema = z.object({
  items: z.array(jobSchema),
  meta: paginationMetaSchema,
  summary: jobSearchSummarySchema,
});
export type JobSearchResponse = z.infer<typeof jobSearchResponseSchema>;

/** Một mục facet {value,count} cho rail (cấp bậc/hình thức/nguồn/địa điểm). */
export const jobFacetCountSchema = z.object({
  value: z.string(),
  count: z.number().int().nonnegative(),
});
export type JobFacetCount = z.infer<typeof jobFacetCountSchema>;

/** Response GET /jobs/facets — đếm GLOBAL toàn bảng (không theo bộ lọc). */
export const jobFacetsResponseSchema = z.object({
  levels: z.array(jobFacetCountSchema),
  employmentTypes: z.array(jobFacetCountSchema),
  sources: z.array(jobFacetCountSchema),
  locations: z.array(jobFacetCountSchema),
  tech: z.array(techFacetSchema),
});
export type JobFacetsResponse = z.infer<typeof jobFacetsResponseSchema>;
```

> **Semantics facet (v1):** đếm **global toàn bảng** (không co theo bộ lọc đang chọn) — đơn giản, ổn định, luôn cho phép chọn mọi giá trị. Khác chút so với hiện tại (rail đang đếm trên tập tech-filtered) nhưng chấp nhận được; ghi rõ trong docs. **Summary** thì tính trên **tập đã lọc** (khớp ngữ nghĩa "Khớp bộ lọc" của StatsBar).

---

## 3. Backend — `apps/backend/src/jobs/`

### 3.1 `jobs.service.ts`

Thêm import:
```ts
import { In, SelectQueryBuilder } from "typeorm";
import {
  jobSearchInputSchema,
  normalizeJobMatchProfile,
  scoreJob,
  type JobSearchInput,
  type JobSearchResponse,
  type JobFacetsResponse,
  type JobFacetCount,
  type JobMatchProfile,
  type JobSearchSummary,
} from "@assistant/shared";
```

#### Hằng & helper sort

```ts
/** Ngưỡng bucket lương (VND) — khớp JobPage. */
const SALARY_15M = 15_000_000;
const SALARY_30M = 30_000_000;
const SALARY_50M = 50_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cột ORDER BY cho sort objective; NULL luôn xuống cuối (khớp client). */
const SORT_ORDER: Record<"crawl" | "posted" | "salary", string> = {
  crawl: "j.crawlAt DESC",
  posted: "(j.postedAt IS NULL), j.postedAt DESC",
  salary:
    "(COALESCE(j.salaryMax, j.salaryMin) IS NULL), COALESCE(j.salaryMax, j.salaryMin) DESC",
};
```

#### `search()` — điểm vào

```ts
async search(input: unknown): Promise<JobSearchResponse> {
  const parsed = jobSearchInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "job_query_invalid",
      message: "Tham số tìm kiếm không hợp lệ",
      details: parsed.error.flatten(),
    });
  }
  const q = parsed.data;
  const profile =
    q.matchProfile && q.matchProfile.enabled
      ? normalizeJobMatchProfile(q.matchProfile)
      : null;
  return profile ? this.searchScored(q, profile) : this.searchPlain(q);
}
```

#### `buildFilteredQb()` — WHERE dùng chung 2 nhánh

```ts
private buildFilteredQb(q: JobSearchInput): SelectQueryBuilder<JobEntity> {
  const qb = this.repo.createQueryBuilder("j");

  if (q.q) {
    const kw = `%${escapeLike(q.q)}%`;
    qb.andWhere(
      "(j.title LIKE :kw OR j.company LIKE :kw OR j.location LIKE :kw)",
      { kw },
    );
  }
  if (q.level?.length)
    qb.andWhere("j.level IN (:...levels)", { levels: q.level });
  if (q.employmentType?.length)
    qb.andWhere("j.employmentType IN (:...types)", { types: q.employmentType });
  if (q.source?.length)
    qb.andWhere("j.source IN (:...sources)", { sources: q.source });
  if (q.location?.length)
    qb.andWhere("j.location IN (:...locs)", { locs: q.location });

  this.applySalaryBucket(qb, q.salaryBucket);

  if (q.postedWithinDays != null) {
    const since = new Date(Date.now() - q.postedWithinDays * DAY_MS);
    qb.andWhere("COALESCE(j.postedAt, j.crawlAt) >= :since", { since });
  }

  if (q.tech?.length) {
    qb.andWhere(
      `j.id IN (SELECT jt.job_id FROM job_technologies jt
        INNER JOIN technologies ft ON ft.id = jt.technology_id
        WHERE ft.slug IN (:...slugs))`,
      { slugs: q.tech },
    );
  }
  return qb;
}

/** rep = COALESCE(salary_max, salary_min). Bucket khớp JobPage.salaryBucketOf. */
private applySalaryBucket(
  qb: SelectQueryBuilder<JobEntity>,
  bucket: JobSearchInput["salaryBucket"],
): void {
  if (!bucket) return;
  if (bucket === "thoa-thuan") {
    qb.andWhere("j.salaryMin IS NULL AND j.salaryMax IS NULL");
    return;
  }
  const rep = "COALESCE(j.salaryMax, j.salaryMin)";
  qb.andWhere(`${rep} IS NOT NULL`);
  if (bucket === "0-15") qb.andWhere(`${rep} < :a`, { a: SALARY_15M });
  else if (bucket === "15-30")
    qb.andWhere(`${rep} >= :a AND ${rep} < :b`, { a: SALARY_15M, b: SALARY_30M });
  else if (bucket === "30-50")
    qb.andWhere(`${rep} >= :a AND ${rep} < :b`, { a: SALARY_30M, b: SALARY_50M });
  else if (bucket === "50+") qb.andWhere(`${rep} >= :a`, { a: SALARY_50M });
}
```

> `escapeLike(s)`: escape `%` `_` `\` để người dùng không phá LIKE. Viết helper nhỏ ở cuối file.

#### Nhánh barem TẮT — `searchPlain()` (SQL pagination thật)

```ts
private async searchPlain(q: JobSearchInput): Promise<JobSearchResponse> {
  const total = await this.buildFilteredQb(q).getCount();

  // Trang: chọn id theo thứ tự (KHÔNG join to-many → offset/limit chuẩn).
  const sortKey = q.sort === "match" ? "crawl" : q.sort; // match vô nghĩa khi barem tắt
  const idRows = await this.buildFilteredQb(q)
    .select("j.id", "id")
    .orderBy(/* dùng addOrderBy theo SORT_ORDER[sortKey], xem ghi chú dưới */)
    .offset((q.page - 1) * q.limit)
    .limit(q.limit)
    .getRawMany<{ id: string }>();

  const items = await this.loadDtosByIds(idRows.map((r) => r.id));
  const summary = await this.summarizePlain(q);
  return { items, meta: makeMeta(q, total), summary };
}
```

> **Ghi chú ORDER BY:** `SORT_ORDER` chứa biểu thức nhiều mệnh đề (vd `(j.postedAt IS NULL), j.postedAt DESC`). `.orderBy()` của TypeORM nhận 1 biểu thức + hướng; với biểu thức phức hợp nên dùng **raw**: `.orderBy(SORT_ORDER[sortKey])` (truyền nguyên chuỗi, không kèm tham số hướng) — TypeORM cho phép truyền expression string. **Verify cú pháp khi code** (có thể phải tách thành nhiều `.addOrderBy("(j.postedAt IS NULL)").addOrderBy("j.postedAt","DESC")`). Cần test.

```ts
private async loadDtosByIds(ids: string[]): Promise<Job[]> {
  if (ids.length === 0) return [];
  const rows = await this.repo.find({
    where: { id: In(ids) },
    relations: { technologies: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is JobEntity => r != null)
    .map((r) => toDtoFromEntity(r)); // giữ đúng thứ tự trang
}

private async summarizePlain(q: JobSearchInput): Promise<JobSearchSummary> {
  const total = await this.buildFilteredQb(q).getCount();

  const since7 = new Date(Date.now() - 7 * DAY_MS);
  const new7 = await this.buildFilteredQb(q)
    .andWhere("COALESCE(j.postedAt, j.crawlAt) >= :since7", { since7 })
    .getCount();

  const withSalaryCount = await this.buildFilteredQb(q)
    .andWhere("(j.salaryMin IS NOT NULL OR j.salaryMax IS NOT NULL)")
    .getCount();

  let medianSalary = 0;
  if (withSalaryCount > 0) {
    const mid = Math.floor((withSalaryCount - 1) / 2);
    const row = await this.buildFilteredQb(q)
      .andWhere("(j.salaryMin IS NOT NULL OR j.salaryMax IS NOT NULL)")
      .select("COALESCE(j.salaryMax, j.salaryMin)", "rep")
      .orderBy("rep", "ASC")
      .offset(mid)
      .limit(1)
      .getRawOne<{ rep: string | number }>();
    medianSalary = row ? Number(row.rep) : 0;
  }

  return {
    total,
    new7,
    withSalaryCount,
    medianSalary,
    matchEnabled: false,
    matchAvg: 0,
    matchTop: 0,
  };
}
```

#### Nhánh barem BẬT — `searchScored()` (nạp cả tập, chấm điểm JS)

```ts
private async searchScored(
  q: JobSearchInput,
  profile: JobMatchProfile,
): Promise<JobSearchResponse> {
  const rows = await this.buildFilteredQb(q)
    .leftJoinAndSelect("j.technologies", "t")
    .getMany(); // getMany hydrate đúng quan hệ to-many, không nhân dòng

  const now = Date.now();
  const scored = rows
    .map((r) => toDtoFromEntity(r))
    .map((job) => ({ job, result: scoreJob(job, profile, now) }))
    .filter((x) => !x.result.hidden); // luật cứng: hideMissingMustHave/minSalary/minScore

  sortScored(scored, q.sort); // mutate-in-place hoặc trả mảng mới (immutable ưu tiên)

  const total = scored.length;
  const start = (q.page - 1) * q.limit;
  const items = scored.slice(start, start + q.limit).map((x) => x.job);

  const summary = summarizeScored(scored, now);
  return { items, meta: makeMeta(q, total), summary };
}
```

Helper thuần (đặt ngoài class, tái dùng được + test được):

```ts
interface ScoredJob { job: Job; result: import("@assistant/shared").JobMatchResult }

/** rep VND đại diện: trần → sàn → null. */
function repOf(job: Job): number | null {
  return job.salaryMax ?? job.salaryMin ?? null;
}
/** Mốc thời gian job (ms): postedAt → crawlAt. */
function timeOf(job: Job): number {
  const t = new Date(job.postedAt ?? job.crawlAt).getTime();
  return Number.isNaN(t) ? 0 : t;
}
function sortScored(arr: ScoredJob[], sort: JobSearchInput["sort"]): void {
  if (sort === "match") arr.sort((a, b) => b.result.score - a.result.score);
  else if (sort === "salary")
    arr.sort((a, b) => (repOf(b.job) ?? -1) - (repOf(a.job) ?? -1));
  else if (sort === "posted")
    arr.sort((a, b) => dateVal(b.job.postedAt) - dateVal(a.job.postedAt));
  else arr.sort((a, b) => dateVal(b.job.crawlAt) - dateVal(a.job.crawlAt)); // crawl
}
function dateVal(v: string | null): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}
function summarizeScored(scored: ScoredJob[], now: number): JobSearchSummary {
  const jobs = scored.map((s) => s.job);
  const reps = jobs
    .map(repOf)
    .filter((n): n is number => n != null && n > 0)
    .sort((a, b) => a - b);
  const median = reps.length ? reps[Math.floor((reps.length - 1) / 2)] : 0;
  const scores = scored.map((s) => s.result.score);
  const matchAvg = scores.length
    ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length)
    : 0;
  return {
    total: jobs.length,
    new7: jobs.filter((j) => now - timeOf(j) <= 7 * DAY_MS && timeOf(j) > 0).length,
    withSalaryCount: reps.length,
    medianSalary: median,
    matchEnabled: true,
    matchAvg,
    matchTop: scores.filter((s) => s >= 80).length,
  };
}

function makeMeta(q: JobSearchInput, total: number) {
  return {
    page: q.page,
    limit: q.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
```

> **Lưu ý:** `new7` của `summarizeScored` đảm bảo `timeOf>0` để không tính nhầm job thiếu ngày. Cẩn thận điều kiện `<= 7d && >0`.

#### `listFacets()` — đếm global

```ts
async listFacets(): Promise<JobFacetsResponse> {
  const [levels, employmentTypes, sources, locations, tech] = await Promise.all([
    this.facetColumn("level"),
    this.facetColumn("employmentType"),
    this.facetColumn("source"),
    this.facetColumn("location"),
    this.listTechFacets(),
  ]);
  return { levels, employmentTypes, sources, locations, tech };
}

private async facetColumn(
  prop: "level" | "employmentType" | "source" | "location",
): Promise<JobFacetCount[]> {
  const rows = await this.repo
    .createQueryBuilder("j")
    .select(`j.${prop}`, "value")
    .addSelect("COUNT(*)", "count")
    .where(`j.${prop} IS NOT NULL AND j.${prop} <> ''`)
    .groupBy(`j.${prop}`)
    .orderBy("count", "DESC")
    .addOrderBy("value", "ASC")
    .getRawMany<{ value: string; count: string | number }>();
  return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
}
```

### 3.2 `jobs.controller.ts`

Thêm 2 route (giữ nguyên `GET /jobs`, `GET /jobs/tech-facets`, `POST /jobs`, `DELETE /jobs/:id`):

```ts
import type {
  IngestJobResponse, Job, TechFacet,
  JobSearchResponse, JobFacetsResponse,
} from "@assistant/shared";

// trong class, đặt TRƯỚC @Post() ingest cho gọn (không bắt buộc):

/** Tìm/lọc/sắp xếp + phân trang. Body Zod-validate trong service → @Body() unknown. */
@Post("search")
search(@Body() body: unknown): Promise<JobSearchResponse> {
  return this.svc.search(body);
}

/** Facet global cho rail lọc + editor barem. */
@Get("facets")
facets(): Promise<JobFacetsResponse> {
  return this.svc.listFacets();
}
```

> **Route order:** `@Get("facets")` và `@Get("tech-facets")` đều static, không clash với `@Delete(":id")`. `@Post("search")` khác `@Post()` ingest. Đều **public** (không guard) — đồng nhất module. Để `POST /jobs/search` bỏ qua ValidationPipe toàn cục như ingest: dùng `@Body() body: unknown`.

---

## 4. Frontend — `apps/frontend/src/lib/api.ts`

Thêm vào import block (từ `@assistant/shared`): `jobSearchResponseSchema`, `jobFacetsResponseSchema`, `type JobSearchInput`, `type JobSearchResponse`, `type JobFacetsResponse`.

Thêm trong object `api` (cạnh `listJobs`/`listTechFacets`, **giữ nguyên 2 hàm đó**):

```ts
// Jobs — tìm kiếm phân trang (JobPage). POST vì body chứa barem lồng nhau.
searchJobs: async (query: JobSearchInput): Promise<JobSearchResponse> =>
  jobSearchResponseSchema.parse(
    await request("/jobs/search", { method: "POST", body: query, auth: false }),
  ),

// Facet global cho rail + editor barem.
listJobFacets: async (): Promise<JobFacetsResponse> =>
  jobFacetsResponseSchema.parse(
    await request("/jobs/facets", { auth: false }),
  ),
```

> `request<T>(path, {method,body,auth,signal})` đã hỗ trợ POST + body (xem `api.ts:191`). `auth:false` đồng nhất với `listJobs`.

---

## 5. Frontend — `apps/frontend/src/pages/JobPage.tsx` (sửa lớn, chỉ phần data-flow)

**Giữ nguyên** mọi sub-component trình bày (FilterRail, JobCard, JobDetail, StatsBar, MetricCard, SearchablePills, ...). Chỉ đổi **component `JobPage` chính** + thêm sub-component phân trang. Các helper client-side không còn dùng (`filtered`, `countBy` cho options, `computeStats`, `sortJobs`, `salaryBucketOf` dùng để lọc, `withinDays`...) sẽ **bỏ bớt** — nhưng `JobCard`/`JobDetail` vẫn cần `formatSalary`, `scoreJob` (re-score trang), `sourceLabel`, `formatDate`...

### 5.1 State mới

```ts
const PAGE_SIZE = 24;
const [page, setPage] = useState(1);
const debouncedSearch = useDebounce(search, 300); // search gõ phím → server
```

> **Kiểm tra:** có sẵn `useDebounce` trong `apps/frontend/src/lib` hay `hooks/` không? Nếu **chưa**, tạo `apps/frontend/src/lib/use-debounce.ts` (pattern chuẩn trong rule typescript/patterns.md). (Cần verify — xem mục 8.)

### 5.2 Map UI filter → query

`salary` (string bucket UI) → `salaryBucket`; `posted` (string ngày) → `postedWithinDays: Number(posted) || undefined`. `levels/types/sources/locations/selectedTech` → mảng tương ứng. `sort` (SortKey) → `sort`. Profile gửi khi `profile.enabled`.

```ts
const effectiveProfile = profileDraft ?? savedProfile ?? DEFAULT_JOB_MATCH_PROFILE;

// Phần query KHÔNG gồm page — đổi nó thì reset page.
const searchArgs = useMemo<JobSearchInput>(() => ({
  q: debouncedSearch.trim() || undefined,
  tech: selectedTech.length ? selectedTech : undefined,
  level: levels.length ? levels : undefined,
  employmentType: types.length ? types : undefined,
  source: sources.length ? sources : undefined,
  location: locations.length ? locations : undefined,
  salaryBucket: (salary || undefined) as JobSearchInput["salaryBucket"],
  postedWithinDays: posted ? Number(posted) : undefined,
  sort,
  limit: PAGE_SIZE,
  page, // sẽ ghi đè ở query bên dưới
  matchProfile: effectiveProfile.enabled ? effectiveProfile : undefined,
}), [debouncedSearch, selectedTech, levels, types, sources, locations, salary, posted, sort, page, effectiveProfile]);

// Reset trang khi BẤT KỲ tiêu chí nào (trừ page) đổi:
const filterKey = JSON.stringify({ ...searchArgs, page: 0 });
useEffect(() => { setPage(1); }, [filterKey]);
```

> **Cảnh báo barem live-preview:** `effectiveProfile` đổi mỗi khi user kéo slider trong MatchProfileEditor → re-query server. **Phải debounce** profile (vd `useDebounce(effectiveProfile, 400)` cho phần gửi server) để không spam request mỗi lần kéo. Cân nhắc: chỉ gửi `savedProfile` cho list, hoặc debounce `effectiveProfile`. **Quyết định khi code** — xem Mục 9 (open question O1).

### 5.3 Query

```ts
const jobsQuery = useQuery({
  queryKey: ["jobs-search", filterKey, page],
  queryFn: () => api.searchJobs({ ...searchArgs, page }),
  placeholderData: keepPreviousData, // v5: giữ trang cũ khi chuyển trang (đỡ nháy)
});
const facetsQuery = useQuery({
  queryKey: ["jobs-facets"],
  queryFn: api.listJobFacets,
});

const items = jobsQuery.data?.items ?? [];
const meta = jobsQuery.data?.meta;
const summary = jobsQuery.data?.summary;
const facets = facetsQuery.data;
```

> **Kiểm tra version TanStack Query** (v4 dùng `keepPreviousData: true`; v5 dùng `placeholderData: keepPreviousData` import từ `@tanstack/react-query`). Xem Mục 8.

### 5.4 Re-score ≤PAGE_SIZE item của trang (cho badge/breakdown)

```ts
const scoredById = useMemo(() => {
  const map = new Map<string, JobMatchResult>();
  if (effectiveProfile.enabled) {
    for (const job of items) map.set(job.id, scoreJob(job, effectiveProfile, now));
  }
  return map;
}, [items, effectiveProfile, now]);
```

(Chỉ chấm ≤24 item → rẻ. Thứ tự/ẩn do server quyết; client chỉ vẽ badge.)

### 5.5 Rail options từ facets server

```ts
const levelOptions  = facets?.levels  ?? [];
const typeOptions   = facets?.employmentTypes ?? [];
const sourceOptions = facets?.sources ?? [];
const locationOptions = facets?.locations ?? [];
// FilterRail đang nhận CountOption[] {value,count} → JobFacetCount khớp sẵn.
// techNameOf: map từ facets.tech (slug→name) như cũ.
```

### 5.6 StatsBar từ summary

Đổi `StatsBar` nhận `summary` (JobSearchSummary) thay cho `stats` tính client. Map field: total/new7/withSalaryCount/medianSalary/matchEnabled/matchAvg/matchTop. (Bỏ `computeStats`.)

### 5.7 Render danh sách + phân trang

- `hasJobs` = `(meta?.total ?? 0) > 0`.
- Đổi `{filtered.length} công việc` → `{meta?.total} công việc`.
- Lưới render `items` (không phải `filtered`).
- Empty/error states: giữ; thêm trạng thái "trang trống do lọc" khi `meta.total===0`.
- Thêm sub-component `JobsPagination` ở cuối `<main>`:

```tsx
function JobsPagination({
  page, totalPages, total, onPage,
}: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = pageWindow(page, totalPages); // [1, '…', 4,5,6, '…', 20]
  return (
    <nav className="mt-6 flex flex-col items-center gap-2" aria-label="Phân trang">
      <div className="flex items-center gap-1">
        <PagerBtn disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">‹ Trước</PagerBtn>
        {pages.map((p, i) =>
          p === "…" ? <span key={`e${i}`} className="px-2 text-muted-foreground">…</span>
          : <PagerBtn key={p} active={p === page} onClick={() => onPage(p)}>{p}</PagerBtn>
        )}
        <PagerBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">Sau ›</PagerBtn>
      </div>
      <p className="text-2xs text-muted-foreground">Trang {page}/{totalPages} · {total} việc</p>
    </nav>
  );
}
```

- `onPage`: `setPage(p)` + cuộn container lên đầu (`scrollTo({top:0})` — container là `<div className="h-full overflow-y-auto">` ngoài cùng; cần ref).
- `pageWindow(current, total)`: trả mảng số trang + `'…'` (hiển thị đầu/cuối + lân cận current, vd ±2). Viết helper thuần (test được).
- **Clamp page out-of-range:** nếu `page > totalPages` (vd sau khi lọc còn ít trang), `useEffect` đưa về `totalPages`.

### 5.8 Invalidation mutation

`deleteMutation.onSuccess`: đổi/ thêm key:
```ts
void queryClient.invalidateQueries({ queryKey: ["jobs-search"] });
void queryClient.invalidateQueries({ queryKey: ["jobs-facets"] });
void queryClient.invalidateQueries({ queryKey: ["jobs"] }); // để JobStatsPage cũng refresh
```

---

## 6. Tests — `apps/backend/src/jobs/jobs.service.spec.ts` (mới)

Test **helper thuần** (không cần DB): `repOf`, `timeOf`, `sortScored` (4 chế độ, NULL xuống cuối), `summarizeScored` (median/new7/withSalary/matchAvg/matchTop), `makeMeta` (totalPages, clamp), `escapeLike`, `pageWindow` (nếu để ở shared util backend). Để test được, **export** các helper này (hoặc tách sang `jobs.search-utils.ts`).

> Backend Jest: `rootDir: src`, testRegex `.*\.spec\.ts$` (xem `apps/backend/package.json` / `jest` config). Chạy: `pnpm --filter @assistant/backend test -- jobs.service`.
> Phần `search()` end-to-end (QueryBuilder thật) cần DB → để cho `test:e2e` hoặc kiểm thử thủ công. **Verify setup test DB** — Mục 8.

Cân nhắc thêm test frontend (Vitest) cho `pageWindow` nếu để ở frontend.

---

## 7. Docs — `docs/modules/jobs/README.md`

- **Primary Entrypoints:** thêm dòng `POST /jobs/search` và `GET /jobs/facets` (controller), mô tả `search`/`listFacets`/`buildFilteredQb` (service).
- **Data Flow:** thêm luồng đọc phân trang server-side; nêu rõ 2 nhánh (barem tắt → SQL `LIMIT/OFFSET`; barem bật → nạp cả tập + `scoreJob` + cắt trang). Ghi đặc tính: **bật barem ⇒ tải toàn tập vào backend**.
- **When To Touch:** thêm hàng "Đổi lọc/sắp xếp/phân trang danh sách" → `jobs.service.ts search()` + `jobs.ts` query schema + `JobPage.tsx`.
- **Permission & Access:** ghi `POST /jobs/search` công khai, nhận `matchProfile` trong body (không nhạy cảm, không lưu).
- **Semantics:** facet **global**; summary theo **tập lọc**.
- Thêm **Document History** row: `| 2026-06-17 | Thêm phân trang server-side + facet/summary cho danh sách jobs | <author> |`.
- Cập nhật `apps/frontend/CLAUDE.md` / `docs/architecture/frontend.md` nếu cần (data-flow mới).
- **Chạy link verifier** (bắt buộc): `wsl.exe -d Ubuntu bash -lic 'cd /home/ubuntu/workspace/2026_projects/smart-assistant && python3 docs/_scripts/check_links.py'` → phải in `OK`.

---

## 8. Cần verify đầu phiên mai (chưa chắc 100%)

1. **`useDebounce`** đã tồn tại trong frontend chưa? (`apps/frontend/src/lib`, `hooks/`). Nếu chưa → tạo.
2. **TanStack Query version** (v4/v5) → quyết `keepPreviousData` vs `placeholderData: keepPreviousData`. Xem `apps/frontend/package.json`.
3. **Backend test DB / e2e setup** (`apps/backend/test/jest-e2e.json`, có testcontainers/MySQL test không?) → quyết mức test `search()`.
4. **Migration/index jobs:** liệt kê migration jobs hiện có + index trên bảng `jobs`. Cân nhắc thêm migration index `(crawl_at)`, `(source)`, `(level)`, `(employment_type)` cho sort/filter (tùy chọn v1; bảng nhỏ thì hoãn). Nếu thêm: entity + migration cùng lúc (`synchronize:false`).
5. **Cú pháp ORDER BY phức hợp** với TypeORM `.orderBy()` (chuỗi `(col IS NULL), col DESC`) — test thực tế, có thể phải tách `addOrderBy`.
6. **`techFacetSchema`** đã export từ `jobs.ts` (đã xác nhận: có) để dùng trong `jobFacetsResponseSchema`.

---

## 9. Open questions / rủi ro

- **O1 — Live-preview barem vs server round-trip:** kéo slider barem → mỗi thay đổi `effectiveProfile` gây re-query. Giải: debounce `effectiveProfile` (~400ms) cho phần gửi server + `placeholderData: keepPreviousData`. Hoặc: list dùng `savedProfile`, chỉ re-query khi bấm "Lưu". **Chốt khi code** (đề xuất: debounce effectiveProfile).
- **O2 — Free-text search bỏ tech-name:** SQL `q` chỉ quét title/company/location (client cũ quét cả techStack). Vì đã có facet công nghệ nên chấp nhận; nếu cần, thêm `OR EXISTS(... technologies.name LIKE ...)`.
- **O3 — Tải toàn tập khi barem bật:** không tránh được (scoreJob là JS). Với quy mô assistant cá nhân (vài trăm–vài nghìn job) là ổn. Nếu phình to: cân nhắc cache điểm hoặc cột điểm vật hóa (tương lai).
- **O4 — Facet global không co theo bộ lọc:** v1 chấp nhận; nếu muốn faceted-search "đúng" (đếm trừ chính chiều đang lọc) → nâng cấp sau, tốn N query.
- **O5 — `now` lệch FE/BE:** server chấm bằng `Date.now()` lúc request; client re-score badge bằng `now` đóng băng phiên. Lệch sub-score "độ mới" không đáng kể (thứ tự do server, hiển thị do client). Bỏ qua.

---

## 10. Thứ tự thực thi (mai)

1. `pnpm install` (nếu cần) · mở `pnpm dev:shared` watch.
2. **Shared** (Mục 2) → `pnpm --filter @assistant/shared typecheck && build`.
3. **Backend** service+controller (Mục 3) → `pnpm --filter @assistant/backend typecheck`.
4. **Backend tests** (Mục 6) → `pnpm --filter @assistant/backend test -- jobs`.
5. **Frontend api** (Mục 4) → typecheck.
6. **Frontend JobPage** (Mục 5) → `pnpm --filter @assistant/frontend typecheck`.
7. **Verify toàn bộ:** `pnpm lint` (max-warnings 0) · `pnpm build` · chạy app thử (`pnpm dev`), kiểm tay: phân trang, đổi lọc reset trang, bật/tắt barem + sort match, StatsBar, rail facet, xóa job.
8. **Docs** (Mục 7) + link verifier `OK`.
9. **GitNexus** `detect_changes()` trước khi commit; impact lại nếu cần.
10. Commit theo conventional commits (`feat: server-side pagination for jobs list`). KHÔNG tự push/PR trừ khi được yêu cầu.

> Mọi lệnh pnpm/node/test chạy qua `wsl.exe -d Ubuntu bash -lic '...'`.

---

## 11. Tasks đã tạo trong phiên (tham chiếu)

1. Shared: schema tìm kiếm + facets cho jobs
2. Backend: search() + listFacets() trong jobs service/controller
3. Frontend api.ts: searchJobs + listJobFacets
4. Frontend JobPage: query server + UI số trang
5. Backend tests: helper thuần cho search
6. Docs: cập nhật module jobs README
7. Verify: typecheck + lint + test + build qua WSL
