# Backend Architecture

Backend là NestJS API trong `apps/backend`. Mỗi domain được tổ chức theo module, controller, service và TypeORM entity/migration.

## Responsibilities

Backend chịu trách nhiệm:

- Xác thực và phân quyền bằng JWT.
- Validate request body/query bằng Zod schemas từ `@assistant/shared`.
- Thực thi business rules và user ownership checks.
- Đọc/ghi MySQL qua TypeORM repositories.
- Chạy background jobs qua Redis/BullMQ cho reminder flows.
- Tích hợp external services như Google OAuth, Telegram và AI providers.

## Module layout

```txt
apps/backend/src/
├── auth/        # JWT, refresh token, Google OAuth, current user decorator
├── common/      # shared backend utilities: crypto, pipes
├── config/      # environment validation
├── database/    # TypeORM module and migrations
├── health/      # health endpoint
├── notes/       # notes, notebooks, tags, attachments
├── schedule/    # events, tasks, reminders, Telegram worker
├── expense/     # wallets, categories, transactions, budgets, reports
├── settings/    # encrypted user settings
├── users/       # user entity and lookup service
└── main.ts      # app bootstrap
```

## Controller pattern

Controllers are thin HTTP adapters:

1. Apply guards such as `JwtAuthGuard`.
2. Extract current user with `@CurrentUser()`.
3. Validate params/body/query.
4. Delegate to a service.
5. Return DTOs or `204 No Content`.

Example locations:

- `apps/backend/src/notes/notes.controller.ts`
- `apps/backend/src/notes/notebooks.controller.ts`
- `apps/backend/src/notes/tags.controller.ts`
- `apps/backend/src/notes/attachments.controller.ts`

## Service pattern

Services hold business rules and persistence orchestration:

- Scope every user-owned query by `userId`.
- Assert ownership before reading/writing nested resources.
- Convert entities to DTOs before returning.
- Throw Nest exceptions with stable `code` and Vietnamese `message`.

## Validation boundary

Request validation should happen at the HTTP boundary:

- Body schemas: `create*InputSchema`, `update*InputSchema`.
- Query schemas: feature-specific query schemas.
- Route IDs: `ParseUUIDPipe`.

Shared schema source lives in `packages/shared/src`.

## Database access

The backend uses TypeORM repositories and migrations:

- Entities define runtime ORM mapping.
- Migrations define the actual schema used by MySQL.
- New persisted fields require both entity and migration updates.

## Error shape

Service exceptions generally include:

```json
{
  "code": "note_not_found",
  "message": "Không tìm thấy ghi chú"
}
```

Frontend converts non-2xx responses into `ApiError` with `status`, `code`, `message` and optional `details`.

## Security rules

- Do not trust client-provided IDs without verifying ownership.
- Do not expose `storedPath`, encrypted secrets, hashes or tokens in DTOs.
- Validate external inputs at controller/service boundaries.
- Use environment variables for secrets and provider credentials.
