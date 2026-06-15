# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal Assistant — a self-hosted, mobile-first PWA for notes, schedule, expenses, jobs, vocab, and an AI assistant. **Vietnamese-only UI, VND-only money.** All user-facing text and service error messages are written in Vietnamese.

## 1. Critical Rules

1. **Do not guess.** Every command, path, and class/file name you put in code or docs must be verified by reading the real source. If unsure, write `TODO: confirm` — never invent.
2. **Be consistent with existing patterns.** Match the surrounding module's structure (thin controller → service holds rules → entity/migration), naming, and error-shape conventions before introducing anything new.
3. **Find the nearest existing file before creating a new one.** Extend an existing module/schema/doc when it fits; explain why if you must create new.
4. **Prefer skills / MCP** for research and library docs over hand-rolling. Edit the shared Zod schema first when changing any API shape, then both sides.
5. **Docs are part of the feature contract** — see [§9 Documentation & Architecture Maintenance](#9-documentation--architecture-maintenance-binding). A change that touches a module without updating its doc is **not done**.
6. **Run pnpm/node/tests through WSL** (`wsl.exe -d Ubuntu bash -lic '…'`), not Windows-native pnpm. The repo lives in the Ubuntu WSL filesystem.

## 2. Stack

- **Monorepo:** pnpm workspace (`pnpm@9.12.3`, Node `>=20.11`). Build order matters: shared → backend → frontend.
- **Backend:** NestJS 10 (`@assistant/backend`) · TypeORM 0.3 + MySQL 8 · BullMQ 5 on Redis · Passport (JWT + Google OAuth) · Zod (`nestjs-zod`) · Pino logging · bcrypt.
- **Frontend:** React 18 + Vite 5 PWA (`@assistant/frontend`) · TanStack Router + TanStack Query · TipTap editor · Tailwind 3 + Radix/Shadcn UI · `vite-plugin-pwa`.
- **Shared contract:** `@assistant/shared` — Zod schemas + `z.infer` types, the single source of truth for request/response shapes.
- **Infra:** MySQL 8, Redis 7, Docker Compose (local + prod), host Nginx + Certbot in prod.

## 3. Development Commands

Run from the repo root unless noted. (In this environment, prefix with `wsl.exe -d Ubuntu bash -lic '…'`.)

```bash
pnpm install                # install all workspaces
pnpm dev                    # shared (watch) + backend (watch) + frontend (Vite), parallel
pnpm dev:backend            # backend only          (nest start --watch)
pnpm dev:frontend           # frontend only         (vite)
pnpm dev:shared             # shared only           (tsc --watch)
pnpm build                  # build order: shared → backend → frontend (this order matters)
pnpm typecheck              # tsc across all packages
pnpm lint                   # eslint across all packages (--max-warnings 0)
pnpm test                   # all tests
```

Backend runs at `http://localhost:3000/api` (global `api` prefix; port from `BACKEND_PORT`). Frontend at `http://localhost:5173`, proxying `/api` to the backend. Health check: `GET /api/health`.

### Single test

- Backend (Jest, `rootDir: src`, test regex `.*\.spec\.ts$`):
  ```bash
  pnpm --filter @assistant/backend test -- crypto.service           # by path fragment
  pnpm --filter @assistant/backend test -- -t "decrypts payload"    # by test name
  pnpm --filter @assistant/backend test:watch
  pnpm --filter @assistant/backend test:e2e                         # uses test/jest-e2e.json
  ```
- Frontend (Vitest):
  ```bash
  pnpm --filter @assistant/frontend test -- <pattern>
  pnpm --filter @assistant/frontend test:watch
  ```

### Migrations (TypeORM)

Schema source of truth is migrations in `apps/backend/src/database/migrations`, **not** entity auto-sync (`synchronize: false` always). A new persisted field requires updating **both** the entity and a migration. Two data-source flavors: `typeorm:dev` runs the `.ts` source via `tsx`; `typeorm:prod` runs the compiled `dist/` source via node — so build before running prod-style migrations.

```bash
pnpm --filter @assistant/backend migration:generate src/database/migrations/<Name>
pnpm --filter @assistant/backend migration:run:dev      # against src (no build)
pnpm --filter @assistant/backend build && pnpm --filter @assistant/backend migration:run   # dist/
pnpm --filter @assistant/backend migration:revert
```

### Docker (local infra) & production

```bash
pnpm docker:up / docker:down / docker:logs   # local MySQL 8 + Redis 7
pnpm prod:build / prod:up / prod:down / prod:logs
pnpm prod:migrate                              # runs migrations inside the backend container
pnpm prod:backup                               # mysqldump + uploads archive into ./backups
```

**Production topology is non-obvious:** the prod stack (`docker-compose.prod.yml`) runs **only Redis + backend + frontend in Docker — MySQL is native on the host**, reached via `host.docker.internal` (set `MYSQL_HOST` in `.env.production`). Containers bind to `127.0.0.1` only (backend `:3001`, frontend `:8081`); a host Nginx reverse-proxies `APP_DOMAIN` and terminates HTTPS via Certbot. Full procedure lives in [`docs/setup.md`](docs/setup.md).

## 4. Architecture

### Shared contract boundary (`packages/shared`)

Zod schemas in `packages/shared/src/*.ts` (one file per domain) are the single source of truth for request/response shapes. Convention:

- Input schemas: `create<Thing>InputSchema`, `update<Thing>InputSchema`; query schemas per feature.
- DTO/response schemas: `<thing>Schema`; types are `z.infer`-ed and re-exported from `index.ts`.
- **Backend** validates HTTP bodies/queries against the input schemas at the controller boundary; route IDs use `ParseUUIDPipe`.
- **Frontend** parses every API *response* with the same schemas (in `apps/frontend/src/lib/api.ts`) — even though the backend already validated input — to catch contract drift. When changing an API shape, edit the shared schema **first**, then both sides.

### Backend (`apps/backend/src`)

One NestJS module per domain, wired in `app.module.ts` in this order: `CryptoModule, DatabaseModule, UsersModule, SettingsModule, AuthModule, NotesModule, ScheduleModule, ExpenseModule, AiModule, VocabModule, JobsModule, JobSyncModule, N8nModule, HealthModule`. Entities are registered for the CLI in `database/data-source.ts`.

- **Controllers are thin HTTP adapters:** apply `JwtAuthGuard`, get the user via `@CurrentUser()`, validate, delegate to a service, return a DTO or `204 No Content` for deletes.
- **Services hold business rules + persistence.** Every user-owned query is scoped by `userId`; nested resources verify parent ownership before read/write. Services throw Nest exceptions carrying a stable `code` and a Vietnamese `message` (e.g. `{ code: "note_not_found", message: "Không tìm thấy ghi chú" }`); the frontend maps non-2xx into an `ApiError` with `status/code/message/details`.
- **Never expose** password hashes, refresh-token hashes, encryption keys/encrypted blobs, attachment `storedPath`, or provider credentials in DTOs.
- Bootstrap (`main.ts`): global `api` prefix, global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` + `transform`), CORS disabled in production (host Nginx owns the origin), Pino logging (auth headers/cookies/passwords redacted).
- Env is validated at startup via Zod in `config/env.validation.ts` — the app refuses to boot on invalid/missing vars. `JWT_*_SECRET` ≥ 32 chars, `ENCRYPTION_KEY` exactly 64 hex chars. Env files load from repo root (`.env.local`, then `.env`).

### Background work & integrations

`schedule` uses **BullMQ on Redis** for reminders (`reminders.queue.ts` enqueues, `reminders.worker.ts` processes, `telegram.service.ts` delivers); `job-sync` uses a second BullMQ queue (`job-sync.scheduler.ts` + `job-sync.worker.ts`) to pull external job sources (VietnamWorks) and feed the `jobs` module. The `ai` module does multi-provider, tool-calling, streaming chat. `n8n` integrates a workflow-automation backend. Per-user secrets (AI keys, Telegram token, n8n key) are stored **AES-256-GCM-encrypted** in user settings via `common/crypto` — never plaintext.

### Frontend (`apps/frontend/src`)

- `pages/*Page.tsx` own page-level state, TanStack Query queries/mutations, and layout. `components/<feature>/*` are presentational; `components/ui/*` are Shadcn/Radix primitives; `components/editor/*` is the TipTap note editor.
- Routes (TanStack Router, `router.tsx`): `/notes` (default), `/vocab`, `/job`, `/job/stats`, `/schedule`, `/expense`, `/assistant`, `/settings`; public: `/login`, `/register`, `/auth/callback`, `/share/$token`.
- `lib/api.ts` is the **only** HTTP entry point: builds URLs under `VITE_API_BASE_URL` (or `/api`), attaches `Authorization: Bearer <accessToken>`, retries once on `401` by refreshing the token, parses responses with shared Zod schemas, throws `ApiError` otherwise. Tokens live in `lib/storage.ts`; auth session in `features/auth/AuthContext.tsx`.

## 5. Key Directories

```txt
apps/backend/src/
├── ai/            # multi-provider, tool-calling, streaming chat (conversation/message/tool-call)
├── auth/          # JWT + Google OAuth + refresh tokens; guards, strategies, decorators
├── common/        # crypto (AES-256-GCM), pipes (zod-validation)
├── config/        # env.validation.ts (Zod, fail-fast on boot)
├── database/      # data-source.ts (entity registry), migrations/ (schema source of truth)
├── expense/       # wallets, categories, transactions, budgets, reports (VND)
├── health/        # GET /api/health
├── job-sync/      # scheduled sync of external job sources (VietnamWorks) via BullMQ
├── jobs/          # job storage, technology normalization, job-match scoring
├── n8n/           # n8n workflow-automation integration
├── notes/         # notes/notebooks/tags/attachments/shares/references; full-text + LIKE search
├── schedule/      # events/tasks/reminders + BullMQ + Telegram delivery
├── settings/      # per-user encrypted secrets (AI keys, Telegram token, n8n key)
├── users/         # user records
└── vocab/         # vocabulary items
apps/frontend/src/
├── pages/         # *Page.tsx — page state + TanStack Query + layout
├── components/    # editor/ (TipTap), jobs/, notes/, layout/, theme/, ui/ (Radix/Shadcn)
├── features/      # auth/AuthContext.tsx
├── lib/           # api.ts (sole HTTP entry), storage.ts, note-lock.ts, cn.ts
└── router.tsx     # TanStack Router route tree
packages/shared/src/  # one Zod file per domain; index.ts re-exports
docs/                 # see §9 and docs/architecture.md (master index)
```

## 6. Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Shared input schema | `create<Thing>InputSchema` / `update<Thing>InputSchema` | `createNoteInputSchema` |
| Shared DTO schema | `<thing>Schema` (+ `z.infer` type re-exported from `index.ts`) | `noteSchema` → `Note` |
| NestJS files | `<feature>.<role>.ts` | `notes.controller.ts`, `notes.service.ts`, `notes.module.ts` |
| TypeORM entity | `<thing>.entity.ts`, class `PascalCase` | `note.entity.ts` → `Note` |
| Migration | `<timestamp>-<kebab-name>.ts` | `1718200000000-job-sync.ts` |
| Error payload | stable snake_case `code` + Vietnamese `message` | `{ code: "note_not_found", message: "Không tìm thấy ghi chú" }` |
| Frontend page | `PascalCasePage.tsx` | `NotesPage.tsx` |
| Frontend component | `kebab-case.tsx` (presentational) | `notes-explorer.tsx` |
| React hooks/booleans | `useX` / `is`,`has`,`should`,`can` prefixes | `useAuth`, `isShare` |
| DB identifiers | `snake_case`, UUIDs as `CHAR(36)` | `user_id`, `content_text` |

## 7. Prohibited Patterns

Reviewers must reject:

- **DB/repository access inside a controller.** Controllers stay thin; queries live in services.
- **Any query not scoped by `userId`** (or not verifying parent ownership for nested resources). The `userId` boundary is enforced in SQL **and** service code.
- **Exposing secrets in a DTO:** password/refresh-token hashes, encryption keys or encrypted blobs, attachment `storedPath`, provider credentials.
- **`fetch`/`axios` or raw URLs inside React components.** All HTTP goes through `apps/frontend/src/lib/api.ts`; responses are Zod-parsed.
- **Hardcoded secrets / API keys / hosts.** Use env vars validated in `config/env.validation.ts`; per-user secrets go through `common/crypto`.
- **Entity field added without a matching migration** (`synchronize` is always `false`).
- **Changing an API shape on one side only.** Edit the shared Zod schema first, then backend + frontend.
- **English user-facing strings.** UI text and service `message`s are Vietnamese; money is VND.
- **`console.log` / debug statements committed** to production code.

## 8. Database

- **Engine:** MySQL 8, `utf8mb4_unicode_ci`, UTC (`timezone: "Z"`). Local infra via `pnpm docker:up`; prod MySQL is native on the host (see §3).
- **Schema source of truth:** migrations in `apps/backend/src/database/migrations` (`synchronize: false`). Entities + migration must change together.
- **Conventions:** IDs and `user_id` are UUIDs stored as `CHAR(36)`; timestamps are `DATETIME(6)`, exposed as ISO strings. Most domain tables carry a `user_id` FK to `users(id)` — the primary tenant boundary.
- **Notes search:** MySQL full-text index on `(title, content_text)` with the ngram parser, plus a LIKE fallback in the service for short/partial queries.
- **Attachments:** file bytes on disk under `UPLOAD_DIR`; DB stores a relative path resolved through a safe-join check to prevent path traversal.
- Connection + entity registry: `apps/backend/src/database/data-source.ts`. Details: [`docs/architecture/database.md`](docs/architecture/database.md), [`docs/infra/database-migrations/README.md`](docs/infra/database-migrations/README.md).

## 9. Documentation & Architecture Maintenance (BINDING)

**Docs are part of the feature contract. Skipping them = the task is not done.** `docs/architecture.md` is the master index for any cross-cutting task.

### MUST READ before implementing

| If your change touches… | Read first |
|-------------------------|------------|
| Any backend domain module (`apps/backend/src/<m>/`) | `docs/modules/<m>/README.md` + [`docs/architecture/backend.md`](docs/architecture/backend.md) |
| A shared schema (`packages/shared/src/*.ts`) | the affected `docs/modules/<m>/README.md` (contract boundary in §4) |
| Frontend (`apps/frontend/src/`) | [`docs/architecture/frontend.md`](docs/architecture/frontend.md) |
| Migrations / data-source | [`docs/infra/database-migrations/README.md`](docs/infra/database-migrations/README.md) + [`docs/architecture/database.md`](docs/architecture/database.md) |
| BullMQ queues/workers (`schedule`, `job-sync`) | [`docs/infra/queue-bullmq/README.md`](docs/infra/queue-bullmq/README.md) |
| Crypto / per-user secrets | [`docs/infra/crypto-secrets/README.md`](docs/infra/crypto-secrets/README.md) |
| A 3rd-party integration (Telegram, VietnamWorks, n8n, Google OAuth, AI providers) | `docs/platforms/<name>/README.md` |
| Anything auth / secrets / user data | [`docs/architecture/security.md`](docs/architecture/security.md) |

### MUST UPDATE after implementing

1. Update the related module/platform/infra `README.md` so it still matches the code.
2. Append a **Document History** row to every doc you touched: `| YYYY-MM-DD | one-line summary | author |`.
3. If you added a feature that has no doc, create one from [`docs/_template/MODULE_TEMPLATE.md`](docs/_template/MODULE_TEMPLATE.md).

### Self-check before reporting "done"

- [ ] Did I read the relevant doc(s) **before** editing code?
- [ ] Does every file I changed have an updated doc home?
- [ ] Does every doc I touched have a new Document History line?
- [ ] Do all relative `.md` links still resolve? (run the link verifier in [`docs/CLAUDE.md`](docs/CLAUDE.md))

### Narrow exceptions (state the reason when you use one)

Only skip the doc update for: a typo in a comment, a format-only commit, or a test-only change that does not touch the contract.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **smart-assistant** (3629 symbols, 9160 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/smart-assistant/context` | Codebase overview, check index freshness |
| `gitnexus://repo/smart-assistant/clusters` | All functional areas |
| `gitnexus://repo/smart-assistant/processes` | All execution flows |
| `gitnexus://repo/smart-assistant/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
