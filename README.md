# Personal Assistant

Web app cá nhân tự host: notes, schedule, expenses, AI assistant. Vietnamese-only, VND-only, mobile-first PWA.

Full spec: [`docs/SRS.md`](./docs/SRS.md).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript, Tailwind + Shadcn/ui, TanStack Query/Router, TipTap, vite-plugin-pwa |
| Backend | NestJS 10 + TypeORM, MySQL 8, Redis 7, BullMQ, Passport (JWT + Google), Pino |
| Shared | Zod schemas in `packages/shared` |
| Infra | Docker Compose (MySQL, Redis), Nginx + Certbot in prod |

## Layout

```
assistant/
├── apps/
│   ├── backend/        # NestJS API
│   └── frontend/       # React + Vite PWA
├── packages/
│   └── shared/         # Zod schemas + shared types
├── docker/             # mysql/, nginx/ configs
├── docs/SRS.md         # spec
├── docker-compose.yml  # MySQL + Redis (dev)
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js ≥ 20.11
- pnpm ≥ 9 (`corepack enable && corepack prepare pnpm@9.12.3 --activate`)
- Docker + Docker Compose

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure env
cp .env.example .env
# Edit JWT_*_SECRET and ENCRYPTION_KEY (see comments inside .env)

# 3. Start MySQL + Redis
pnpm docker:up

# 4. Run database migrations (first time, or after pulling new migrations)
pnpm --filter @assistant/backend build       # compile migrations to dist/
pnpm --filter @assistant/backend migration:run

# 5. Run backend + frontend in parallel
pnpm dev
# Backend → http://localhost:3000/api  (or BACKEND_PORT from .env)
# Frontend → http://localhost:5173 (proxies /api to backend)

# 6. Health check
curl http://localhost:3000/api/health
```

### Auth quickstart

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"superlongpassword123","name":"You"}'

# Login → returns { accessToken, refreshToken, expiresIn }
# /api/auth/me                 (Bearer)
# PATCH /api/auth/settings     (Bearer) — AI key + Telegram token encrypted AES-256-GCM
# POST /api/auth/refresh       (rotates refresh token)
# POST /api/auth/logout        (revokes refresh)
# GET  /api/auth/google → redirect flow (only when GOOGLE_CLIENT_ID set)
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Run shared (watch) + backend (watch) + frontend (Vite) in parallel |
| `pnpm dev:backend` | Backend only |
| `pnpm dev:frontend` | Frontend only |
| `pnpm build` | Build shared → backend → frontend |
| `pnpm typecheck` | Type-check all packages |
| `pnpm test` | Run all tests |
| `pnpm docker:up` | Start MySQL + Redis |
| `pnpm docker:down` | Stop containers (volumes preserved) |
| `pnpm docker:logs` | Tail container logs |

## Roadmap

Per `docs/SRS.md` §9 — checkpoints 0 → 6, ~11 days total.

- [x] **Checkpoint 0** — Foundation (monorepo, Docker Compose, NestJS+React skeleton, shared package)
- [x] **Checkpoint 1** — Auth (JWT + Google OAuth + AES-256-GCM-encrypted settings)
- [x] **Checkpoint 2** — Notes (notebooks, tags, attachments, FTS)
- [x] **Checkpoint 3** — Schedule (events, tasks, calendar + Kanban, BullMQ + Telegram reminders)
- [ ] Checkpoint 4 — Expense (wallets, categories, transactions, budgets, reports)
- [ ] Checkpoint 5 — AI (multi-provider, tool calling, streaming chat)
- [ ] Checkpoint 6 — Production (Dockerfiles, Nginx+HTTPS, backups, deploy README)
