# Shared Contract — CLAUDE.md

Auto-loaded when working under `packages/shared/`. Defer to the root [`CLAUDE.md`](../../CLAUDE.md) for repo-wide rules.

`@assistant/shared` is the **single source of truth** for every request/response shape exchanged between backend and frontend. Changing a schema here is an API change on both sides.

## Always do this FIRST

1. Read the "Shared contract boundary" section of the root [`CLAUDE.md` §4](../../CLAUDE.md#4-architecture).
2. Read the doc for the domain whose schema you are editing (table below).

### Schema → module doc map

| Schema file(s) | Read this doc |
|----------------|---------------|
| `auth.ts` | [modules/auth](../../docs/modules/auth/README.md) |
| `notes.ts`, `notebooks.ts`, `tags.ts`, `shares.ts` | [modules/notes](../../docs/modules/notes/README.md) |
| `events.ts`, `tasks.ts`, `reminders.ts` | [modules/schedule](../../docs/modules/schedule/README.md) |
| `wallets.ts`, `categories.ts`, `transactions.ts`, `budgets.ts`, `reports.ts` | [modules/expense](../../docs/modules/expense/README.md) |
| `ai.ts` | [modules/ai](../../docs/modules/ai/README.md) · [platforms/ai-providers](../../docs/platforms/ai-providers/README.md) |
| `jobs.ts`, `job-match.ts` | [modules/jobs](../../docs/modules/jobs/README.md) |
| `job-sync.ts` | [modules/job-sync](../../docs/modules/job-sync/README.md) |
| `vocab.ts` | [modules/vocab](../../docs/modules/vocab/README.md) |
| `settings.ts` | [modules/settings](../../docs/modules/settings/README.md) |
| `n8n.ts` | [platforms/n8n](../../docs/platforms/n8n/README.md) |
| `api.ts`, `common.ts` | [architecture/backend](../../docs/architecture/backend.md) (shared envelope/helpers) |

## BINDING schema conventions

- **One file per domain.** Input schemas: `create<Thing>InputSchema`, `update<Thing>InputSchema`, plus per-feature query schemas. DTO/response: `<thing>Schema`.
- Types are `z.infer`-ed and **re-exported from `index.ts`** — add the export there when you add a schema/type.
- **Edit the schema FIRST, then both sides.** Backend validates input against these at the controller boundary; frontend `lib/api.ts` parses every response with the same schema. A change on only one side is a contract break.
- Money fields are VND (integer); IDs are UUID strings; timestamps are ISO strings.
- `pnpm build` builds shared before backend/frontend — keep it compiling (`pnpm --filter @assistant/shared typecheck`).

## After editing — required

1. Update the affected module/platform doc so its schema description matches.
2. Append a **Document History** row (`| YYYY-MM-DD | summary | author |`) to every doc you touched.
3. Update the backend controller/service and frontend usage in the same change set; run the link verifier in [`docs/CLAUDE.md`](../../docs/CLAUDE.md).
