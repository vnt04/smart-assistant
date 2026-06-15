# Frontend — CLAUDE.md

Auto-loaded when working under `apps/frontend/`. Defer to the root [`CLAUDE.md`](../../CLAUDE.md) for repo-wide rules; this file adds frontend-layer specifics.

## Always do this FIRST

1. Read [`docs/architecture/frontend.md`](../../docs/architecture/frontend.md) for routing, data flow, and component layering.
2. Read the doc for the **feature** you are touching (table below). For cross-cutting work start at [`docs/architecture.md`](../../docs/architecture.md).

### Path → doc map

| Code path | Read this doc |
|-----------|---------------|
| `src/lib/api.ts` | [architecture/frontend](../../docs/architecture/frontend.md) (HTTP + shared-contract boundary) |
| `src/features/auth/**`, `src/pages/{Login,Register,GoogleCallback}Page.tsx` | [modules/auth](../../docs/modules/auth/README.md) · [platforms/google-oauth](../../docs/platforms/google-oauth/README.md) |
| `src/pages/NotesPage.tsx`, `src/components/{notes,editor}/**` | [modules/notes](../../docs/modules/notes/README.md) · [features/notes](../../docs/features/notes/overview.md) |
| `src/pages/{Job,JobStats}Page.tsx`, `src/components/jobs/**` | [modules/jobs](../../docs/modules/jobs/README.md) · [modules/job-sync](../../docs/modules/job-sync/README.md) · [platforms/n8n](../../docs/platforms/n8n/README.md) |
| `src/pages/SchedulePage.tsx` | [modules/schedule](../../docs/modules/schedule/README.md) |
| `src/pages/ExpensePage.tsx` | [modules/expense](../../docs/modules/expense/README.md) |
| `src/pages/VocabPage.tsx` | [modules/vocab](../../docs/modules/vocab/README.md) |
| `src/pages/AssistantPage.tsx` | [modules/ai](../../docs/modules/ai/README.md) |
| `src/pages/SettingsPage.tsx` | [modules/settings](../../docs/modules/settings/README.md) |
| `src/pages/SharedPage.tsx` | [modules/notes](../../docs/modules/notes/README.md) (public share) |

## BINDING data-flow contract

- **All HTTP goes through `src/lib/api.ts`.** Never call `fetch`/`axios` or hardcode a URL inside a component or page. `api.ts` attaches the bearer token, retries once on `401`, and **Zod-parses every response** with `@assistant/shared` schemas — bypassing it loses contract-drift protection.
- **Server state via TanStack Query;** mutations must invalidate the related query keys (e.g. `notes`, `note`, `notebooks`, `tags`). Local/page state lives in `pages/*Page.tsx`.
- **Component layering:** `pages/*` own state + queries + layout; `components/<feature>/*` are presentational; `components/ui/*` are Radix/Shadcn primitives (don't fork them per-feature); `components/editor/*` is the TipTap editor.
- **Vietnamese UI, VND money.** All user-facing strings are Vietnamese; format money as VND.
- Tokens live in `lib/storage.ts`; auth session in `features/auth/AuthContext.tsx`. Routing is TanStack Router in `router.tsx`.

## After editing — required

1. Update the feature doc from the path→doc map (and `docs/architecture/frontend.md` for data-flow changes).
2. Append a **Document History** row (`| YYYY-MM-DD | summary | author |`) to every doc you touched.
3. Run the self-check in the root [`CLAUDE.md` §9](../../CLAUDE.md#9-documentation--architecture-maintenance-binding) and the link verifier in [`docs/CLAUDE.md`](../../docs/CLAUDE.md).
