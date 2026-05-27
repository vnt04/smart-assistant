# Frontend Architecture

Frontend là React + Vite PWA trong `apps/frontend`. UI được tổ chức theo pages, feature components, shared UI primitives và một API client typed bằng Zod schemas.

## Responsibilities

Frontend chịu trách nhiệm:

- Render mobile-first UI.
- Điều hướng giữa các page chính.
- Quản lý authenticated session ở client.
- Fetch/cache server state bằng TanStack Query.
- Validate API responses bằng schemas từ `@assistant/shared`.
- Gửi request kèm access token và refresh token khi cần.

## Source layout

```txt
apps/frontend/src/
├── components/
│   ├── editor/      # TipTap note editor and slash commands
│   ├── layout/      # App shell
│   ├── notes/       # Notes-specific explorer UI
│   ├── theme/       # Theme provider
│   └── ui/          # Reusable UI primitives
├── features/
│   └── auth/        # Auth context
├── lib/
│   ├── api.ts       # Typed HTTP client
│   ├── cn.ts        # className utility
│   └── storage.ts   # token storage
├── pages/           # Route-level screens
├── router.tsx       # App routes
└── main.tsx         # React bootstrap
```

## Server state

TanStack Query is used for server state:

- Query keys identify backend resources such as `notes`, `note`, `notebooks`, `tags`.
- Mutations invalidate or update related queries after success.
- Page components own the orchestration between query data and UI components.

## API client

`apps/frontend/src/lib/api.ts` centralizes HTTP calls:

1. Builds request URLs under `VITE_API_BASE_URL` or `/api`.
2. Adds `Authorization` when auth is enabled.
3. Attempts token refresh once on `401`.
4. Parses successful responses with shared Zod schemas.
5. Throws `ApiError` for non-2xx responses.

## Component boundaries

- `pages/*Page.tsx`: page-level state, queries, mutations and layout composition.
- `components/<feature>/*`: feature UI pieces that receive data and callbacks.
- `components/ui/*`: low-level UI primitives without feature-specific business rules.
- `components/editor/*`: editor-specific UI and TipTap behavior.

## Mobile-first behavior

The app uses responsive layouts instead of separate mobile screens. For Notes, the page switches between list and editor on small screens while keeping sidebar + editor visible on desktop.

## Frontend validation rule

Frontend should still parse API responses with Zod even though backend validates inputs. The browser receives data from an external boundary, so response parsing catches backend/client contract drift early.
