> **Status:** Draft — generated from code survey on 2026-06-15
> **Last updated:** 2026-06-15
> **Owners:** TODO: confirm

# Vocab Module

Module quản lý danh sách từ vựng cần học. Mỗi từ được lưu một lần (dedup không phân biệt hoa/thường) kèm `count` đếm số lần "gặp lại" để biết từ nào hay quên nhất. Khác với các module khác trong dự án, đây là endpoint **công khai (không xác thực)**, được thiết kế để tiện ích trình duyệt (browser extension) gọi trực tiếp khi người dùng bôi đen một từ; trang web (`VocabPage`) cũng dùng cùng API đó. Lỗi được chuẩn hóa về đúng contract của extension (`{ status: "error", reason }`).

## Document Map

- [Root CLAUDE.md](../../../CLAUDE.md) · [Architecture index](../../architecture.md) · [Backend architecture](../../architecture/backend.md)
- Schema chia sẻ: `packages/shared/src/vocab.ts` (xem bảng Primary Entrypoints).
- TODO: confirm — chưa có doc `features/` hay `api/` riêng cho vocab; cập nhật link tại đây nếu được tạo.

## Module Purpose

- Ghi nhận một lần "gặp" từ vựng: tạo từ mới hoặc tăng `count` của từ đã tồn tại (`POST /api/vocab`).
- Liệt kê toàn bộ từ đã lưu, sắp theo `count` giảm dần rồi `text` tăng dần (`GET /api/vocab`).
- Xóa vĩnh viễn một từ theo `id` (`DELETE /api/vocab/:id`).
- Dedup không phân biệt hoa/thường dựa trên `text` đã được trim + gộp khoảng trắng.
- THUỘC phạm vi: lưu trữ từ vựng dùng chung, chuẩn hóa input, chuẩn hóa lỗi cho extension.
- KHÔNG thuộc phạm vi: gắn từ vựng theo từng người dùng (bảng không có `user_id`), nhắc lịch ôn (spaced repetition), dịch nghĩa, hay tích hợp AI. `notes` được lưu nhưng hiện chưa có endpoint cập nhật.

## Primary Entrypoints

| Layer | Entrypoint | Purpose |
|-------|-----------|---------|
| Controller | `apps/backend/src/vocab/vocab.controller.ts` | HTTP adapter công khai: `GET` list, `POST` track (201 created / 200 incremented), `DELETE :id` (204). Áp `VocabExceptionFilter`. |
| Service | `apps/backend/src/vocab/vocab.service.ts` | Nghiệp vụ: validate/normalize input, dedup theo `normalized`, tạo/tăng `count`, xử lý đua tạo trùng (`ER_DUP_ENTRY`). |
| Entity | `apps/backend/src/vocab/entities/vocab-item.entity.ts` | Bảng `vocab_items`: `id`, `text`, `normalized` (unique), `count`, `notes`, `created_at`, `updated_at`. |
| Shared schema | `packages/shared/src/vocab.ts` | Nguồn chuẩn của input/response: `createVocabInputSchema`, `vocabItemSchema`, `trackVocabResponseSchema`, `vocabErrorResponseSchema` và các hằng `MAX_VOCAB_TEXT_LENGTH`, `MAX_VOCAB_COUNT`. |
| Frontend (page) | `apps/frontend/src/pages/VocabPage.tsx` | Trang quản lý từ vựng trên web. |
| Frontend (API) | `apps/frontend/src/lib/api.ts` | `listVocab` / `createVocab` / `deleteVocab` — gọi với `auth: false`, parse response bằng schema chia sẻ. |

> Đường dẫn trong bảng là tuyệt đối từ repo root.

## Core Supporting Objects

- `apps/backend/src/vocab/vocab-exception.filter.ts` — `VocabExceptionFilter` (`@Catch()`): chuẩn hóa MỌI lỗi của endpoint vocab về `{ status: "error", reason }`. Lỗi đã mang sẵn body dạng vocab (do service ném ra) thì giữ nguyên status code; lỗi khác → `500` với `reason: "server_error"`.
- `apps/backend/src/vocab/vocab.module.ts` — `VocabModule`: đăng ký `TypeOrmModule.forFeature([VocabItemEntity])`, controller, service; `exports: [VocabService]`. Được nạp trong `apps/backend/src/app.module.ts`.
- `apps/backend/src/database/migrations/1717200000000-vocab.ts` — `Vocab1717200000000`: tạo bảng `vocab_items` (unique key `uq_vocab_normalized`, index `ix_vocab_count`).
- Hàm phụ trợ trong `vocab.service.ts`: `extractInput` (parse body untrusted qua `createVocabInputSchema`, phân biệt `invalid_count` vs `empty`), `normalizeText` (trim + gộp khoảng trắng), `isDuplicateEntry` (nhận diện `ER_DUP_ENTRY`), `toDto` (chỉ map `{ id, text, count, notes }`).
- Hằng nội bộ `MYSQL_DUPLICATE_ENTRY = "ER_DUP_ENTRY"` trong service.

## Data Flow

Luồng request đồng bộ (không có queue/async trong module này):

```mermaid
flowchart LR
  Ext[Extension / VocabPage] -->|POST /api/vocab| Ctl[VocabController.track]
  Ctl --> Svc[VocabService.track]
  Svc -->|normalize + validate| Chk{cleaned hợp lệ?}
  Chk -- empty/too_long --> Err[BadRequest -> reason]
  Chk -- ok --> Find[repo.findOne by normalized]
  Find -- tồn tại --> Inc[increment count -> 200 incremented]
  Find -- chưa có --> Save[repo.save]
  Save -- ER_DUP_ENTRY --> Inc
  Save -- ok --> New[201 created]
  Inc --> DB[(MySQL vocab_items)]
  New --> DB
  Err --> Filter[VocabExceptionFilter]
  Filter -->|{status:error, reason}| Ext
```

- `POST /api/vocab`: `extractInput` lấy `text` và `count` (mặc định 1) từ body chưa tin cậy. `normalizeText` trim + gộp khoảng trắng; rỗng → `empty`, vượt `MAX_VOCAB_TEXT_LENGTH` (50) → `too_long`. Tìm theo `normalized` (lowercase): có thì `increment` `count` và trả `incremented` (200); chưa có thì `save` và trả `created` (201). Nếu hai request tạo trùng cùng lúc, lỗi `ER_DUP_ENTRY` được bắt lại và chuyển sang tăng `count`.
- `GET /api/vocab`: `repo.find` sắp `count DESC, text ASC`, map qua `toDto`.
- `DELETE /api/vocab/:id`: `repo.delete`; nếu `affected = 0` → `NotFoundException` với `reason: "not_found"` (filter trả về với status 404).
- Mọi lỗi đi qua `VocabExceptionFilter` để giữ đúng contract `{ status: "error", reason }`.
- Async/background: không có.

## When To Touch Which File

| If you want to… | Edit | Then also… |
|-----------------|------|------------|
| Thêm/đổi field persist (vd: cho phép cập nhật `notes`) | `apps/backend/src/vocab/entities/vocab-item.entity.ts` + migration mới trong `apps/backend/src/database/migrations` | cập nhật `packages/shared/src/vocab.ts` + service + frontend; đăng ký entity trong `apps/backend/src/database/data-source.ts` (TODO: confirm đã đăng ký chưa) |
| Đổi shape request/response API | `packages/shared/src/vocab.ts` | controller + service (`toDto`/`extractInput`) + `apps/frontend/src/lib/api.ts` + `VocabPage.tsx` |
| Thêm/sửa mã lỗi (`reason`) | `vocabErrorReasonSchema` trong `packages/shared/src/vocab.ts` | nơi ném lỗi trong `vocab.service.ts` và logic ánh xạ trong `vocab-exception.filter.ts` |
| Đổi quy tắc dedup / chuẩn hóa text | `normalizeText` / `track` trong `apps/backend/src/vocab/vocab.service.ts` | cân nhắc unique key `uq_vocab_normalized` (cần migration nếu đổi cột) |
| Đổi giới hạn độ dài / count | `MAX_VOCAB_TEXT_LENGTH` / `MAX_VOCAB_COUNT` trong `packages/shared/src/vocab.ts` | đồng bộ `length` cột `text`/`normalized` trong entity + migration |

## Permission & Access Rules

- **Endpoint công khai, KHÔNG xác thực:** controller không áp `JwtAuthGuard` và không dùng `@CurrentUser()`; frontend gọi với `auth: false`. Đây là ngoại lệ so với phần lớn module khác (vốn yêu cầu JWT).
- **KHÔNG scope theo `userId`:** bảng `vocab_items` không có cột `user_id`; dữ liệu từ vựng là dùng chung toàn hệ thống, không tách theo người dùng.
- **Validate biên:** body được parse bằng `createVocabInputSchema` (Zod) trong service trước khi xử lý; `:id` dùng `ParseUUIDPipe` ở controller.
- **Không expose ra DTO:** `toDto` chỉ trả `{ id, text, count, notes }`. Các cột `normalized`, `created_at`, `updated_at` KHÔNG được đưa ra response.
- `reason: "unauthorized"` có khai báo trong `vocabErrorReasonSchema` nhưng hiện không được phát sinh ở luồng nào trong code đã khảo sát (endpoint đang public). TODO: confirm liệu có cơ chế bảo vệ ở tầng khác (vd Nginx/extension key) hay không.

## Legacy / Operational Notes

- `notes` (varchar 1000, default `""`) được lưu trong DB và trả về DTO, nhưng `track` luôn ghi `notes: ""` và chưa có endpoint cập nhật → hiện là field "để dành". TODO: confirm kế hoạch dùng `notes`.
- Bảng được tạo bởi migration `1717200000000-vocab.ts` với unique key `uq_vocab_normalized` và index `ix_vocab_count` (phục vụ sort theo `count`). Entity khai báo index unique trên `normalized` nhưng `ix_vocab_count` chỉ tồn tại ở migration, không khai báo trong entity — giữ nguyên bằng migration.
- Không có biến môi trường riêng cho module; không dùng Redis/BullMQ.
- CORS bị tắt ở production (host Nginx sở hữu origin) — extension gọi qua origin do Nginx phục vụ. TODO: confirm cách extension được phép gọi qua reverse proxy.

## Where To Start Reading For Maintenance

1. `packages/shared/src/vocab.ts` — hiểu contract input/response và các mã lỗi trước tiên.
2. `apps/backend/src/vocab/vocab.controller.ts` — thấy 3 route và cách áp `VocabExceptionFilter`.
3. `apps/backend/src/vocab/vocab.service.ts` — toàn bộ nghiệp vụ: normalize, dedup, tạo/tăng, xử lý đua.
4. `apps/backend/src/vocab/vocab-exception.filter.ts` — cách lỗi được chuẩn hóa về `{ status, reason }`.
5. `apps/backend/src/vocab/entities/vocab-item.entity.ts` + `apps/backend/src/database/migrations/1717200000000-vocab.ts` — cấu trúc bảng.
6. `apps/frontend/src/pages/VocabPage.tsx` + `apps/frontend/src/lib/api.ts` — phía tiêu thụ trên web.

## Related Modules

- [Backend architecture](../../architecture/backend.md) — mẫu Controller → Service → Entity và quy ước contract chia sẻ áp dụng cho module này (kèm ngoại lệ: vocab là public, không scope `userId`).
- Module này độc lập, không phụ thuộc domain module khác (auth, notes, schedule, expense…). TODO: confirm nếu có liên kết tới một doc feature/API vocab trong tương lai.

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-06-15 | Initial draft generated from code survey | TODO: confirm |
