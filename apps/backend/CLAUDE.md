# Backend — CLAUDE.md

Auto-loaded when working under `apps/backend/`. Defer to the root [`CLAUDE.md`](../../CLAUDE.md) for repo-wide rules; this file adds backend-layer specifics.

## Always do this FIRST

1. Read [`docs/architecture/backend.md`](../../docs/architecture/backend.md) for the layered design, then the doc for the **specific module** you are touching (table below).
2. For cross-cutting work, start at [`docs/architecture.md`](../../docs/architecture.md) (master index).
3. Anything auth / secrets / user data → also read [`docs/architecture/security.md`](../../docs/architecture/security.md).

### Path → doc map

| Code path | Read this doc |
|-----------|---------------|
| `src/ai/**` | [modules/ai](../../docs/modules/ai/README.md) · [platforms/ai-providers](../../docs/platforms/ai-providers/README.md) |
| `src/auth/**` | [modules/auth](../../docs/modules/auth/README.md) · [platforms/google-oauth](../../docs/platforms/google-oauth/README.md) |
| `src/users/**` | [modules/users](../../docs/modules/users/README.md) |
| `src/settings/**` | [modules/settings](../../docs/modules/settings/README.md) · [infra/crypto-secrets](../../docs/infra/crypto-secrets/README.md) |
| `src/notes/**` | [modules/notes](../../docs/modules/notes/README.md) · [features/notes](../../docs/features/notes/overview.md) · [api/notes](../../docs/api/notes.md) |
| `src/schedule/**` | [modules/schedule](../../docs/modules/schedule/README.md) · [platforms/telegram](../../docs/platforms/telegram/README.md) · [infra/queue-bullmq](../../docs/infra/queue-bullmq/README.md) |
| `src/expense/**` | [modules/expense](../../docs/modules/expense/README.md) |
| `src/vocab/**` | [modules/vocab](../../docs/modules/vocab/README.md) |
| `src/jobs/**` | [modules/jobs](../../docs/modules/jobs/README.md) |
| `src/job-sync/**` | [modules/job-sync](../../docs/modules/job-sync/README.md) · [platforms/vietnamworks](../../docs/platforms/vietnamworks/README.md) · [infra/queue-bullmq](../../docs/infra/queue-bullmq/README.md) |
| `src/n8n/**` | [platforms/n8n](../../docs/platforms/n8n/README.md) |
| `src/common/crypto/**` | [infra/crypto-secrets](../../docs/infra/crypto-secrets/README.md) |
| `src/database/**` | [infra/database-migrations](../../docs/infra/database-migrations/README.md) · [architecture/database](../../docs/architecture/database.md) |
| `src/config/**`, `src/main.ts` | [architecture/backend](../../docs/architecture/backend.md) |

## Mandatory layer patterns

- **Controller = thin HTTP adapter.** Apply `JwtAuthGuard`, get the user via `@CurrentUser()`, validate the body/query against the `@assistant/shared` input schema, delegate to a service, return a DTO (or `204` for deletes). **No DB access in controllers.**
- **Service = business rules + persistence.** Scope **every** user-owned query by `userId`; verify parent ownership for nested resources. Throw Nest exceptions with a stable snake_case `code` + a **Vietnamese** `message`.
- **Entity + migration change together.** `synchronize` is always `false`; a new persisted field needs both the entity and a new migration in `src/database/migrations`, plus registration in `src/database/data-source.ts`.
- **Never expose** password/refresh-token hashes, encryption keys/encrypted blobs, attachment `storedPath`, or provider credentials in DTOs.
- **Per-user secrets** (AI keys, Telegram token, n8n key) go through `common/crypto` (AES-256-GCM) — never store plaintext.
- **Background work** uses BullMQ on Redis (`schedule` reminders, `job-sync`). Validate env in `config/env.validation.ts`.

## After editing — required

1. Update the module/platform/infra `README.md` from the path→doc map so it still matches the code.
2. Append a **Document History** row (`| YYYY-MM-DD | summary | author |`) to every doc you touched.
3. Run the self-check in the root [`CLAUDE.md` §9](../../CLAUDE.md#9-documentation--architecture-maintenance-binding) and the link verifier in [`docs/CLAUDE.md`](../../docs/CLAUDE.md).
