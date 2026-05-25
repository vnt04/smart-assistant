# Personal Assistant — Software Requirements Specification (SRS)

**Version:** 0.1 (BA draft)
**Date:** 2026-05-25
**Owner:** copilot.isuccess@gmail.com

---

## 1. Vision

Một web app cá nhân tự host trên VPS, giúp người dùng quản lý notes, kế hoạch/lịch, chi tiêu, và có một AI assistant biết truy vấn dữ liệu cá nhân để hỗ trợ. Mục tiêu: thay thế sự rời rạc của Notion + Google Calendar + MISA + ChatGPT bằng một app gọn nhẹ, riêng tư.

---

## 2. Stakeholders & Users

| Role | Mô tả |
|---|---|
| End user | Cá nhân tự đăng ký, mỗi user dữ liệu cô lập hoàn toàn. |
| Self-host operator | Người deploy lên VPS (thường cũng là end user). |

---

## 3. Functional Requirements

### 3.1 Authentication & User

- FR-A1: Đăng ký bằng email + password (Bcrypt hash, ≥ 12 ký tự, validate trên FE+BE).
- FR-A2: Đăng nhập email/password trả về JWT access (15m) + refresh token (30d).
- FR-A3: Đăng nhập Google OAuth (Passport `google-oauth20` strategy).
- FR-A4: Endpoint refresh token, logout (revoke refresh token).
- FR-A5: User settings: AI provider, AI API key (encrypted AES-256-GCM), Telegram bot token + chat_id, theme (light/dark/system).
- FR-A6: Mọi truy vấn dữ liệu **phải** filter theo `user_id` (TypeORM subscriber hoặc guard enforces).

### 3.2 Notes

- FR-N1: Tạo/đọc/sửa/xoá note với rich text content (TipTap, HTML output + plain-text shadow column cho FULLTEXT).
- FR-N2: Notebook (folder) phân cấp nhiều cấp; mỗi note thuộc tối đa 1 notebook (có thể null = "Uncategorized").
- FR-N3: Tag tự do, many-to-many với notes.
- FR-N4: Full-text search (MySQL `FULLTEXT` trên `title`, `content_text`) với ngrams hoặc fallback `LIKE` cho tiếng Việt.
- FR-N5: Upload attachment (multipart) lưu vào Docker volume; serve qua endpoint có auth check. Giới hạn 20MB/file, các định dạng phổ biến (image, pdf, doc, xlsx, zip).
- FR-N6: Filter notes theo notebook + tag + full-text trong 1 query.

### 3.3 Schedule / Plan

- FR-S1: Event: title, description, start_at, end_at, all_day, location.
- FR-S2: Task: title, description, priority (low/medium/high/urgent), status (todo/doing/done), deadline.
- FR-S3: Calendar view month/week/day (FE) hiển thị events + tasks có deadline.
- FR-S4: Kanban view cho tasks theo status.
- FR-S5: Reminder: gắn vào event/task, lưu `remind_at`, được enqueue vào BullMQ; worker gửi message Telegram đúng giờ.
- FR-S6: MVP **không** hỗ trợ recurring events (để Phase 2).

### 3.4 Expense

- FR-E1: Wallets (ví) — cash, bank, e-wallet, credit card; có balance, icon, name.
- FR-E2: Categories — kind (expense|income), parent_id (sub-category), icon, color. Seed 1 lần khi user đăng ký (Ăn uống, Di chuyển, Mua sắm, Hoá đơn, Lương, ...).
- FR-E3: Transactions — kind (expense|income|transfer), amount (decimal(15,0) VND), wallet_id, category_id, occurred_at, note. Transfer có `transfer_to_wallet_id`.
- FR-E4: Auto cập nhật balance wallet khi transaction được ghi (transaction-safe).
- FR-E5: Budget — `(user_id, category_id, month)` unique; amount + alert_threshold_pct (default 80%). Khi vượt threshold → gửi notification Telegram (chỉ 1 lần/budget/lần vượt).
- FR-E6: Reports: chi tiêu theo category (pie), theo thời gian (line/bar), so sánh tháng. Filter by wallet, category, date range.
- FR-E7: Export CSV cho transactions trong khoảng thời gian được chọn.

### 3.5 AI Assistant

- FR-AI1: Multi-provider — interface `AIProvider` với implementation cho Claude, OpenAI, Ollama; user chọn provider trong settings.
- FR-AI2: Tool/function calling với 10 tools:
  - `searchNotes(query, tags?, notebookId?)`
  - `createNote(title, content, notebookId?, tags?)`
  - `listSchedule(from, to)`
  - `createEvent(title, startAt, endAt, reminder?)`
  - `createTask(title, priority, deadline?)`
  - `queryExpenses(from, to, categoryId?, walletId?)`
  - `createTransaction(kind, amount, walletId, categoryId, note?)`
  - `getBudgetStatus(month)`
  - `summarizeNotes(noteIds[])`
  - `getMonthlyInsights(month)`
- FR-AI3: Conversations + messages persisted; mỗi user có lịch sử chat riêng.
- FR-AI4: Auto-create flow: khi AI gọi tool `create*`, FE hiển thị preview để user confirm trước khi commit.
- FR-AI5: Streaming response (SSE hoặc WebSocket) cho UX tốt.

---

## 4. Non-Functional Requirements

| ID | Yêu cầu |
|---|---|
| NFR-1 | Locale: Tiếng Việt only, hardcode label. Date format `dd/MM/yyyy`. |
| NFR-2 | Currency: VND only, decimal(15,0), format `vi-VN`. |
| NFR-3 | PWA installable, mobile-responsive (375px → 1920px). |
| NFR-4 | Rate limit: 60 req/min/user (general), 20 req/min/user (AI). |
| NFR-5 | Secrets (AI key, Telegram token) encrypt AES-256-GCM với `ENCRYPTION_KEY` env. |
| NFR-6 | Backup: cron `mysqldump` daily → Docker volume; optional rclone tới S3/R2. |
| NFR-7 | Test: unit cho services, e2e cho auth + AI tool flow. Không ép 80% UI. |
| NFR-8 | Logging: structured JSON (Pino), giữ 30 ngày. |
| NFR-9 | Health check endpoint `/api/health` cho Nginx. |

---

## 5. Tech Stack

| Layer | Stack |
|---|---|
| Backend | NestJS 10, TypeORM, MySQL 8 driver, Passport (JWT, Google), Bcrypt, BullMQ, ioredis, class-validator, Pino |
| Frontend | React 18, Vite, TypeScript, Shadcn/ui (Radix + Tailwind), TanStack Query, TanStack Router, TipTap, Recharts, react-big-calendar, vite-plugin-pwa |
| Shared | Zod schemas (validation + types) trong `packages/shared` |
| DB | MySQL 8.0 |
| Cache/Queue | Redis 7 |
| AI | Anthropic SDK, OpenAI SDK, fetch tới Ollama |
| Notification | Telegram Bot API (HTTPS) |
| Storage | Local Docker volume mount |
| Deploy | Docker Compose + Nginx (reverse proxy) + Certbot (Let's Encrypt) |

---

## 6. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  VPS (Docker Compose)                                       │
│                                                              │
│  ┌──────────┐    ┌────────────────┐    ┌─────────────────┐ │
│  │  Nginx   │───>│  React+Vite    │    │  NestJS         │ │
│  │  +HTTPS  │    │  (Shadcn,      │<──>│  (REST API)     │ │
│  │          │───>│   TanStack)    │    │                 │ │
│  └──────────┘    │  PWA           │    │  - Auth         │ │
│                  └────────────────┘    │  - Notes        │ │
│                                         │  - Schedule     │ │
│                                         │  - Expense      │ │
│                                         │  - AI (tools)   │ │
│                                         └────┬────────────┘ │
│              ┌───────────────────────────────┼────────┐     │
│              ▼                               ▼        ▼     │
│         ┌─────────┐                    ┌────────┐  ┌─────┐ │
│         │  MySQL  │                    │ Redis  │  │ Vol │ │
│         │ (data)  │                    │(queue) │  │uploads│
│         └─────────┘                    └────────┘  └─────┘ │
│                                              │              │
│                              ┌───────────────┘              │
│                              ▼                              │
│                       ┌──────────────┐                      │
│                       │ Telegram API │  (per-user bot)      │
│                       │ AI providers │  (Claude/OpenAI/...) │
│                       └──────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### Monorepo structure

```
assistant/
├── apps/
│   ├── backend/          # NestJS + TypeORM
│   └── frontend/         # React + Vite + Shadcn + TanStack
├── packages/
│   └── shared/           # Zod schemas, DTOs, types
├── docker/
│   ├── nginx/
│   └── mysql/
├── docs/
│   └── SRS.md
├── docker-compose.yml          # dev
├── docker-compose.prod.yml     # prod
├── pnpm-workspace.yaml
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## 7. Data Model (logical)

```
users(id, email, password_hash?, google_id?, name, avatar_url, created_at, updated_at)
user_settings(user_id PK, ai_provider, ai_api_key_enc, telegram_bot_token_enc, telegram_chat_id, theme, default_wallet_id?)
refresh_tokens(id, user_id, token_hash, expires_at, revoked_at?)

-- Notes
notebooks(id, user_id, parent_id?, name, color, created_at)
notes(id, user_id, notebook_id?, title, content_html, content_text, created_at, updated_at)  -- FULLTEXT(title, content_text)
tags(id, user_id, name)  -- UNIQUE(user_id, name)
note_tags(note_id, tag_id)
attachments(id, note_id, original_name, stored_path, mime, size, created_at)

-- Schedule
events(id, user_id, title, description?, start_at, end_at, all_day, location?, created_at)
tasks(id, user_id, title, description?, priority, status, deadline?, completed_at?, created_at)
reminders(id, user_id, target_type, target_id, remind_at, sent_at?, job_id?)

-- Expense
wallets(id, user_id, name, type, balance, icon, color, archived, created_at)
categories(id, user_id, name, kind, parent_id?, icon, color, created_at)
transactions(id, user_id, wallet_id, category_id?, kind, amount, occurred_at, note?, transfer_to_wallet_id?, created_at)
budgets(id, user_id, category_id, month, amount, alert_threshold_pct, alerted_at?)  -- UNIQUE(user_id, category_id, month)

-- AI
conversations(id, user_id, title, created_at, updated_at)
messages(id, conversation_id, role, content, tool_calls_json?, tool_result_json?, created_at)
```

---

## 8. API Surface (high-level)

```
# Auth
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/google
GET    /api/auth/google/callback
GET    /api/auth/me
PATCH  /api/auth/settings

# Notes
GET    /api/notebooks            POST /api/notebooks   PATCH/DELETE /:id
GET    /api/tags                 POST /api/tags        DELETE /:id
GET    /api/notes?q=&notebook=&tag=    POST /api/notes
GET    /api/notes/:id            PATCH/DELETE /api/notes/:id
POST   /api/notes/:id/attachments    GET /api/attachments/:id
DELETE /api/attachments/:id

# Schedule
GET    /api/events?from=&to=     POST/PATCH/DELETE /api/events/:id
GET    /api/tasks?status=&priority=   POST/PATCH/DELETE /api/tasks/:id
POST   /api/reminders            DELETE /api/reminders/:id

# Expense
GET    /api/wallets              POST/PATCH/DELETE /api/wallets/:id
GET    /api/categories           POST/PATCH/DELETE /api/categories/:id
GET    /api/transactions?from=&to=&wallet=&category=    POST/PATCH/DELETE /api/transactions/:id
GET    /api/budgets?month=       POST/PATCH/DELETE /api/budgets/:id
GET    /api/reports/expense-by-category?from=&to=
GET    /api/reports/trend?from=&to=&granularity=
GET    /api/reports/export.csv?from=&to=

# AI
GET    /api/ai/conversations     POST /api/ai/conversations
GET    /api/ai/conversations/:id/messages
POST   /api/ai/conversations/:id/messages   (SSE stream)
POST   /api/ai/tool-confirm      (user confirm create* tool call)
```

---

## 9. Implementation Roadmap

| Checkpoint | Scope | Est. |
|---|---|---|
| 0. Foundation | Monorepo, Docker Compose, NestJS+React skeleton, shared package | 1 day |
| 1. Auth | Users, JWT, Google OAuth, settings page | 1 day |
| 2. Notes | Notebooks/tags/notes/attachments + TipTap + search | 2 days |
| 3. Schedule | Events/tasks + calendar + Kanban + Telegram reminder | 2 days |
| 4. Expense | Wallets/categories/transactions/budgets + reports + CSV | 2 days |
| 5. AI | Multi-provider, tool calling, chat UI streaming | 2 days |
| 6. Production | Prod Dockerfiles, Nginx+HTTPS, backup, deploy README | 1 day |
| **Total** | | **~11 days** |

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AI provider lock-in | Provider abstraction interface từ ngày đầu |
| Telegram token leak | Encrypt at rest, không log token, mask trên FE |
| Concurrent wallet balance race | TypeORM transaction + pessimistic lock khi update balance |
| MySQL FULLTEXT yếu với tiếng Việt | Fallback `LIKE` + lưu `content_text` đã normalize (lowercase, strip diacritics) trong column phụ |
| AI cost runaway | Rate limit + token usage tracking trong messages table |
| User mất Telegram chat_id | UI hướng dẫn lại + nút "test notification" |

---

## 11. Out of Scope (Phase 2+)

- Recurring events (RRULE)
- Shared resources giữa users (collab)
- Multi-currency với exchange rate
- Vector RAG cho notes (semantic search)
- Mobile native app
- Voice input cho AI
- Email reminders
- 2FA

---

## 12. Build Status (cập nhật 2026-05-25)

### ✅ Đã xong

- **C0 — Foundation:** monorepo, Docker Compose (MySQL + Redis), NestJS+React skeleton, shared package, Zod validation pipe, Pino logger, ConfigModule.
- **C1 — Auth:** Users, JWT access/refresh, Google OAuth, settings page, AES-256-GCM crypto cho AI key + Telegram token.
- **C2 — Notes:** Notebooks/tags/notes/attachments, TipTap-ready (FE chưa nhúng editor), MySQL FULLTEXT + LIKE fallback, multipart upload với auth-gated download.
- **C3 — Schedule:** Events, Tasks (priority + status kanban), Reminders. BullMQ queue + worker, Telegram Bot API, `/api/reminders/telegram/test` endpoint, SchedulePage (calendar tháng + kanban tasks).

### 🟡 C4 — Expense (đang dở dang)

**Backend đã ship (đã typecheck pass):**
- Shared Zod schemas: `wallets.ts`, `categories.ts`, `transactions.ts`, `budgets.ts`, `reports.ts` + re-export trong `packages/shared/src/index.ts`.
- Migration `apps/backend/src/database/migrations/1717000000000-expense.ts`:
  - 4 bảng: `wallets`, `categories`, `transactions`, `budgets` với index + FK đầy đủ.
  - FK `user_settings.default_wallet_id → wallets(id)` thêm cuối migration.
- 4 entity TypeORM (`wallet/category/transaction/budget.entity.ts`) + amount transformer cho `decimal(15,0)` ↔ number.
- Đăng ký entity trong `data-source.ts` + `database.module.ts`.
- `WalletsService` + controller — CRUD, không xoá ví đang có giao dịch.
- `CategoriesService` + controller — CRUD + `seedDefaults(userId)` (12 danh mục VN mặc định) — đã hook vào `AuthService.register` và Google OAuth strategy.
- `TransactionsService` + controller — CRUD với:
  - DataSource transaction + `pessimistic_write` lock trên wallet rows khi đổi balance.
  - Xử lý đủ 3 kind: `expense`/`income`/`transfer` (transfer khoá cả 2 ví).
  - Validate `category.kind` khớp với `transaction.kind`.
  - Update: hỗ trợ đổi amount (recompute delta trên ví), category, occurredAt, note (không đổi wallet/kind — để xoá tạo lại).
  - Delete: rollback balance.
  - Sau khi save expense + có category: gọi `BudgetsService.checkAndAlert` không chặn (fire-and-forget).
- `BudgetsService` + controller — CRUD; `checkAndAlert` gửi Telegram khi vượt threshold, set `alerted_at` để chỉ alert 1 lần/budget.
- `ReportsService` + controller:
  - `GET /api/reports/expense-by-category?from&to` — group theo category.
  - `GET /api/reports/trend?from&to&granularity=day|week|month` — chi/thu theo bucket.
  - `GET /api/reports/export.csv?from&to` — CSV UTF-8 BOM (mở Excel OK), cột: ngày, loại, số tiền, ví, ví đích, danh mục, ghi chú.
- `ExpenseModule` đã wire vào `AppModule`.
- Frontend API client `apps/frontend/src/lib/api.ts` đã có toàn bộ endpoints: `listWallets/createWallet/updateWallet/deleteWallet`, `listCategories/createCategory/updateCategory/deleteCategory`, `listTransactions/createTransaction/updateTransaction/deleteTransaction`, `listBudgets/createBudget/updateBudget/deleteBudget`, `expenseByCategory/trend/downloadCsv/exportCsvUrl`.

**Còn lại để hoàn tất C4:**
1. **Frontend `apps/frontend/src/pages/ExpensePage.tsx`** — chưa được tạo (Write bị interrupt). Cần:
   - Tabs: `Giao dịch` / `Ví` / `Ngân sách` / `Báo cáo`.
   - Month picker chung cho cả 4 tab.
   - Summary cards: tổng số dư các ví, thu/chi/chênh lệch tháng.
   - Tab Giao dịch: bảng có ngày, loại, ví, danh mục, ghi chú, số tiền, sửa/xoá. Modal tạo mới hỗ trợ expense/income/transfer.
   - Tab Ví: grid card, hiện loại + số dư + nút sửa/xoá. Modal create/edit (edit chỉ đổi name/type/archived, không sửa balance trực tiếp).
   - Tab Ngân sách: list với progress bar 3 màu (xanh < threshold, vàng ≥ threshold, đỏ ≥ 100%).
   - Tab Báo cáo: pie/bar theo category (SVG đơn giản) + trend chart 2-color expense/income theo ngày.
   - Nút "Tải CSV" gọi `api.downloadCsv(...)`.
2. **`apps/frontend/src/router.tsx`** — thêm:
   - `import { ExpensePage } from "./pages/ExpensePage";`
   - Nav link `/expense` với label `Chi tiêu`.
   - `expenseRoute` + thêm vào `addChildren([...])`.
3. **Typecheck frontend:** `pnpm --filter @assistant/frontend typecheck` phải clean.
4. **README:** Tick checkbox C4 `- [x] Checkpoint 4 — Expense`.
5. **Migration:** Sau khi pull về, chạy `pnpm --filter @assistant/backend build && pnpm --filter @assistant/backend migration:run` để tạo 4 bảng mới + FK `user_settings.default_wallet_id`.

**Lưu ý kỹ thuật:**
- AuthModule giờ `import ExpenseModule` để inject `CategoriesService` vào AuthService + GoogleStrategy. Không có circular dep (ExpenseModule chỉ phụ thuộc ScheduleModule, không phụ thuộc AuthModule).
- Budget alert chỉ gửi 1 lần / 1 budget — khi user sửa `amount` hoặc `alertThresholdPct` thì `alertedAt` reset về `null` để có thể alert lại.
- Balance được giữ chính xác bằng `pessimistic_write` lock + DataSource transaction. KHÔNG được thay đổi balance trực tiếp qua `wallets.update` — luôn đi qua `transactions.create/update/delete`.
- TypeORM `decimal(15,0)` cần `transformer` để JS đọc về số (xem `wallet.entity.ts`, `transaction.entity.ts`, `budget.entity.ts`).

### ⏳ Chưa khởi động

- **C5 — AI:** Multi-provider abstraction (Claude/OpenAI/Ollama), 10 tools, conversations + messages persist, streaming SSE/WS, auto-create flow với preview.
- **C6 — Production:** prod Dockerfiles, Nginx + Certbot, daily `mysqldump` backup, deploy README.
