# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal Assistant — a self-hosted, mobile-first PWA for notes, schedule, expenses, and an AI assistant. **Vietnamese-only UI, VND-only money.** All user-facing text and service error messages are written in Vietnamese.

pnpm workspace monorepo (`pnpm@9.12.3`, Node `>=20.11`). Three packages:

- `apps/backend` — NestJS 10 API (`@assistant/backend`)
- `apps/frontend` — React 18 + Vite PWA (`@assistant/frontend`)
- `packages/shared` — Zod schemas + inferred types (`@assistant/shared`), the contract boundary between front and back

## Commands

Run from the repo root unless noted.

```bash
pnpm install                # install all workspaces
pnpm dev                    # shared (watch) + backend (watch) + frontend (Vite), parallel
pnpm dev:backend            # backend only
pnpm dev:frontend           # frontend only
pnpm build                  # build order: shared → backend → frontend (this order matters)
pnpm typecheck              # tsc across all packages
pnpm lint                   # eslint across all packages
pnpm test                   # all tests
```

Backend runs at `http://localhost:3000/api` (global `api` prefix; port from `BACKEND_PORT`). Frontend at `http://localhost:5173`, proxying `/api` to the backend. Health check: `GET /api/health`.

### Single test

- Backend (Jest, test regex `.*\.spec\.ts$` rooted at `src`):
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

Schema source of truth is migrations in `apps/backend/src/database/migrations`, **not** entity auto-sync (`synchronize: false` always). A new persisted field requires updating **both** the entity and a migration.

There are two data-source flavors: `typeorm:dev` runs the `.ts` source via `tsx`; `typeorm:prod` runs the **compiled `dist/`** source via node. So you must build before running prod-style migrations.

```bash
# Local dev — generate then run against src (no build needed)
pnpm --filter @assistant/backend migration:generate src/database/migrations/<Name>
pnpm --filter @assistant/backend migration:run:dev

# Run compiled migrations (CI/prod style) — build first
pnpm --filter @assistant/backend build
pnpm --filter @assistant/backend migration:run     # uses dist/
pnpm --filter @assistant/backend migration:revert
```

### Docker (local infra) & production

```bash
pnpm docker:up / docker:down / docker:logs   # local MySQL 8 + Redis 7
pnpm prod:build / prod:up / prod:down / prod:logs
pnpm prod:migrate                              # runs migrations inside the backend container
pnpm prod:backup                               # mysqldump + uploads archive into ./backups
```

**Production topology is non-obvious:** the prod stack (`docker-compose.prod.yml`) runs **only Redis + backend + frontend in Docker — MySQL is native on the host**, reached via `host.docker.internal` (set `MYSQL_HOST` in `.env.production`). Containers bind to `127.0.0.1` only (backend `:3001`, frontend `:8081`); a host Nginx reverse-proxies `APP_DOMAIN` to them and terminates HTTPS via Certbot. Full procedure (including the `git pull` → `prod:build` → `prod:up` → `prod:migrate` redeploy flow) lives in `docs/setup.md`.

## Architecture

### Shared contract boundary (`packages/shared`)

Zod schemas in `packages/shared/src/*.ts` (one file per domain: `notes`, `events`, `tasks`, `wallets`, `transactions`, `budgets`, `ai`, `auth`, `settings`, …) are the single source of truth for request/response shapes. Convention:

- Input schemas: `create<Thing>InputSchema`, `update<Thing>InputSchema`; query schemas per feature.
- DTO/response schemas: `<thing>Schema`; types are `z.infer`-ed and re-exported from `index.ts`.
- **Backend** validates HTTP bodies/queries against the input schemas at the controller boundary; route IDs use `ParseUUIDPipe`.
- **Frontend** parses every API *response* with the same schemas (in `apps/frontend/src/lib/api.ts`) — even though the backend already validated input — to catch contract drift, since the network is an untrusted boundary.

When changing an API shape, edit the shared schema first, then both sides. `pnpm build` builds shared before backend/frontend for this reason.

### Backend (`apps/backend/src`)

One NestJS module per domain: `auth`, `notes` (notes/notebooks/tags/attachments), `schedule` (events/tasks/reminders), `expense` (wallets/categories/transactions/budgets/reports), `ai`, `settings`, `users`, plus `common` (crypto, pipes), `config`, `database`, `health`. Wired in `app.module.ts`; entities registered for the CLI in `database/data-source.ts`.

- **Controllers are thin HTTP adapters:** apply `JwtAuthGuard`, get the user via `@CurrentUser()`, validate, delegate to a service, return a DTO or `204 No Content` for deletes.
- **Services hold business rules + persistence.** Every user-owned query is scoped by `userId`; nested resources verify parent ownership before read/write. Services throw Nest exceptions carrying a stable `code` and a Vietnamese `message` (e.g. `{ code: "note_not_found", message: "Không tìm thấy ghi chú" }`); the frontend maps non-2xx into an `ApiError` with `status/code/message/details`.
- **Never expose** password hashes, refresh-token hashes, encryption keys/encrypted blobs, attachment `storedPath`, or provider credentials in DTOs.
- Bootstrap (`main.ts`): global `api` prefix, global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` + `transform`), CORS disabled in production (host Nginx owns the origin), Pino logging (auth headers/cookies/passwords redacted).
- Env is validated at startup via Zod in `config/env.validation.ts` — the app refuses to boot on invalid/missing vars. `JWT_*_SECRET` ≥ 32 chars, `ENCRYPTION_KEY` exactly 64 hex chars. Env files load from repo root (`.env.local`, then `.env`).

### Background work & integrations

`schedule` uses **BullMQ on Redis** for reminders: `reminders.queue.ts` enqueues, `reminders.worker.ts` processes, `telegram.service.ts` sends via the Telegram Bot API. The `ai` module does multi-provider, tool-calling, streaming chat (entities: conversation/message/tool-call). Per-user secrets (AI keys, Telegram token) are stored **AES-256-GCM-encrypted** in user settings via `common/crypto` — never plaintext.

### Frontend (`apps/frontend/src`)

- `pages/*Page.tsx` own page-level state, TanStack Query queries/mutations, and layout. `components/<feature>/*` are presentational; `components/ui/*` are Shadcn/Radix primitives; `components/editor/*` is the TipTap note editor.
- Routing via TanStack Router (`router.tsx`); server state via TanStack Query (mutations invalidate related query keys like `notes`, `note`, `notebooks`, `tags`).
- `lib/api.ts` is the only HTTP entry point: builds URLs under `VITE_API_BASE_URL` (or `/api`), attaches `Authorization: Bearer <accessToken>`, retries once on `401` by refreshing the token, parses responses with shared Zod schemas, throws `ApiError` otherwise. Tokens live in `lib/storage.ts`; auth session in `features/auth/AuthContext.tsx`.
- Responsive (not separate mobile screens): e.g. Notes shows list↔editor on mobile, sidebar+editor on desktop.

### Database conventions (MySQL 8)

- IDs and `user_id` are UUIDs stored as `CHAR(36)`; timestamps are `DATETIME(6)`, exposed as ISO strings over the API. `utf8mb4_unicode_ci`, UTC (`timezone: "Z"`).
- Most domain tables carry `user_id` FK to `users(id)` — the primary tenant boundary, enforced in SQL **and** by service-level `userId` scoping.
- Notes search uses a MySQL full-text index on `(title, content_text)` with the ngram parser, plus a LIKE fallback in the service for short/partial queries.
- Attachments: file bytes on disk under `UPLOAD_DIR`; DB stores a relative path resolved through a safe-join check to prevent path traversal.

## Docs

`docs/` is the authoritative reference (mostly Vietnamese): `SRS.md` (spec), `setup.md` (local + prod), `architecture/{overview,backend,frontend,database,security}.md`, and per-feature docs under `features/` + `api/`. Read the relevant architecture doc before non-trivial changes to a layer.
