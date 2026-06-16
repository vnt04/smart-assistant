export const meta = {
  name: 'review-jobs-pagination-plan',
  description: 'Adversarially fact-check and critique implement.md (jobs server-side pagination plan) against the real smart-assistant codebase',
  phases: [
    { title: 'Review', detail: '5 reviewers read real code + implement.md and critique' },
    { title: 'Synthesize', detail: 'merge into a prioritized correction list' },
  ],
}

const ROOT = '\\\\wsl.localhost\\Ubuntu\\home\\ubuntu\\workspace\\2026_projects\\smart-assistant'
const PLAN = `${ROOT}\\implement.md`
const ctx = `Repo root: ${ROOT}. The plan to review is at ${PLAN}. It adds server-side pagination (numbered pages) + full server-side match scoring to the Jobs LIST page. Key files: packages/shared/src/{jobs,job-match,common,index}.ts; apps/backend/src/jobs/{jobs.controller,jobs.service,jobs.module}.ts and entities/job.entity.ts; apps/frontend/src/pages/{JobPage,JobStatsPage}.tsx and src/lib/api.ts; apps/backend/src/database/migrations. READ implement.md FIRST, then read the real files to ground every judgement. Cite file:line. Be concrete and terse.`

const REVIEWERS = [
  { key: 'consistency', prompt: `You are a codebase-consistency reviewer. ${ctx}\n\nVerify EVERY factual claim, file path, symbol name, import, helper signature, and numeric threshold in implement.md against the real code. Flag mismatches (nonexistent symbol, wrong path, wrong helper signature, wrong salary thresholds, wrong sort semantics, wrong column names/decorators). Specifically confirm: (a) request() in lib/api.ts supports {method:'POST', body, auth:false}; (b) packages/shared/src/index.ts re-exports jobs via "export *"; (c) the circular-import reasoning (jobs.ts importing the VALUE jobMatchProfileSchema from job-match.ts while job-match.ts imports only the TYPE Job) is safe; (d) JobEntity column/property names used in the QueryBuilder WHERE strings (j.employmentType→employment_type, j.postedAt→posted_at, j.crawlAt→crawl_at, j.salaryMin/Max) are correct; (e) toDtoFromEntity / techFacetSchema / normalizeJobMatchProfile / scoreJob actually exist and are importable as claimed. List each issue as: CLAIM → REALITY → FIX.` },
  { key: 'backend', prompt: `You are a senior NestJS + TypeORM (0.3, MySQL 8) engineer. ${ctx}\n\nCritique the backend design (Mục 3) for correctness/edge cases and find concrete bugs: (1) TypeORM .orderBy() with a compound raw expression like "(j.postedAt IS NULL), j.postedAt DESC" — does it work or must it be split into addOrderBy? Give the exact working form. (2) Mixing entity-property names (j.salaryMax) with raw SQL subqueries (job_technologies) in the same QueryBuilder — any aliasing/quoting pitfalls in MySQL? (3) getRawMany select "j.id" then In() reload — correct? (4) The COALESCE/median offset trick — correct and null-safe? (5) leftJoinAndSelect + getMany (no pagination) for the scored branch — correct hydration, no row multiplication? (6) BadRequestException shape consistency with the rest of the codebase (read jobs.service.ts ingest). (7) Is validating an untrusted matchProfile via normalizeJobMatchProfile safe? (8) Performance/locking concerns. Give exact code fixes.` },
  { key: 'frontend', prompt: `You are a senior React + TanStack Query + TanStack Router engineer. ${ctx}\n\nCritique the frontend rework (Mục 5). Determine the EXACT TanStack Query major version from apps/frontend/package.json and state whether to use keepPreviousData:true (v4) or placeholderData:keepPreviousData (v5). Check: (a) is there an existing useDebounce hook anywhere under apps/frontend/src (and any existing pagination component)? (b) the page-reset-on-filter-change via JSON.stringify(filterKey) + useEffect — robust? race with placeholderData? (c) sending effectiveProfile live → server spam while dragging barem sliders; best fix? (d) re-scoring page items client-side for badges — is the data (techSlugs etc.) present on the returned Job dto? (e) mutation invalidation keys correctness; (f) scroll-to-top needs a ref to which element (read JobPage.tsx outer container); (g) keeping JobStatsPage working unchanged. Read JobPage.tsx + JobStatsPage.tsx + lib/api.ts. Give concrete fixes with file:line.` },
  { key: 'completeness', prompt: `You are a completeness critic. ${ctx}\n\nFind what implement.md MISSES for a real, shippable implementation. Ground each gap by reading real files. Consider: DB migrations/indexes (read apps/backend/src/database/migrations to list jobs-related ones + indexes on the jobs table; is a new index migration warranted given synchronize:false?); test strategy (read apps/backend/package.json jest config + apps/backend/test for an e2e/DB harness — what is actually unit-testable vs needs DB?); JobStatsPage contract impact; n8n POST /jobs ingest impact (should be none — confirm); empty/loading/error states + out-of-range page; accessibility of the pager; Vietnamese i18n correctness; the GET /jobs/tech-facets endpoint now partially superseded (dead?); whether MatchProfileEditor still gets the facet data it needs; URL/query-state persistence (should page/filter live in the router?). Return a PRIORITIZED list: BLOCKER / SHOULD / NICE, each with the grounding file:line.` },
  { key: 'facts', prompt: `You are a precise fact-finder. ${ctx}\n\nBy READING the real repo, answer with concise bullets + file paths (do NOT critique, just report facts): (1) Exact TanStack Query version in apps/frontend/package.json. (2) Does any useDebounce hook or pagination/Pager component already exist under apps/frontend/src? Paths if yes. (3) Backend jest config: rootDir, testRegex, and what apps/backend/test contains (jest-e2e.json? a DB/testcontainer harness?). (4) List every migration file under apps/backend/src/database/migrations whose name mentions job; and any @Index on JobEntity (read job.entity.ts). (5) Confirm packages/shared/src/index.ts lines for jobs/job-match/common exports. (6) Confirm whether techFacetSchema and normalizeJobMatchProfile and scoreJob are exported from shared (file:line). (7) How do OTHER pages (e.g. ExpensePage, NotesPage) structure useQuery keys + invalidateQueries — quote 2 examples.` },
]

phase('Review')
const reviews = await parallel(
  REVIEWERS.map((r) => () => agent(r.prompt, { label: `review:${r.key}`, phase: 'Review' })),
)

phase('Synthesize')
const reviewText = reviews
  .map((r, i) => `### ${REVIEWERS[i].key}\n${r ?? '(no output)'}`)
  .join('\n\n')
const merged = await agent(
  `You are the lead engineer. Merge these 5 reviews of implement.md (a jobs server-side pagination plan) into ONE prioritized, de-duplicated, actionable correction list for someone coding tomorrow. Sections:\n` +
  `1) BLOCKERS — factual errors or design bugs that would break the build/runtime if coded as written (each: what's wrong → exact fix, with file:line).\n` +
  `2) IMPROVEMENTS — should-fix correctness/UX issues.\n` +
  `3) VERIFIED FACTS — concrete answers to the open questions in Mục 8/9 (TanStack version, useDebounce existence, test DB setup, jobs migrations/indexes, ORDER BY syntax, etc.).\n` +
  `Be specific and terse; prefer code snippets for fixes. Do not invent — if a review didn't establish something, say "unverified".\n\nREVIEWS:\n${reviewText}`,
  { label: 'synthesize', phase: 'Synthesize' },
)

return { merged, reviews: REVIEWERS.map((r, i) => ({ key: r.key, text: reviews[i] })) }
