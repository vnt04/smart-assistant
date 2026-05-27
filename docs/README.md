# Smart Assistant Docs

Tài liệu này là bản đồ điều hướng cho project `smart-assistant`.

## Đọc gì trước?

- Người mới chạy project local: [`setup.md`](./setup.md)
- Hiểu yêu cầu sản phẩm: [`SRS.md`](./SRS.md)
- Hiểu kiến trúc tổng thể: [`architecture/overview.md`](./architecture/overview.md)
- Hiểu backend: [`architecture/backend.md`](./architecture/backend.md)
- Hiểu frontend: [`architecture/frontend.md`](./architecture/frontend.md)
- Hiểu database: [`architecture/database.md`](./architecture/database.md)
- Hiểu bảo mật: [`architecture/security.md`](./architecture/security.md)
- Phát triển Notes: [`features/notes/overview.md`](./features/notes/overview.md)
- Dùng Notes API: [`api/notes.md`](./api/notes.md)

## Quy ước tổ chức docs

- `architecture/`: kiến trúc dùng chung cho toàn app.
- `features/`: tài liệu nghiệp vụ và triển khai theo từng feature.
- `api/`: contract HTTP API theo từng feature.
- `setup.md`: hướng dẫn chạy local hiện tại.
- `SRS.md`: đặc tả yêu cầu sản phẩm gốc.

## Mức chi tiết mong muốn

Feature docs nên đủ để một developer mới có thể:

1. Hiểu feature giải quyết vấn đề gì.
2. Biết flow chính của người dùng.
3. Biết frontend/backend/shared/database nằm ở đâu.
4. Biết API contract và validation chính.
5. Biết edge cases và checklist test trước khi sửa tiếp.
