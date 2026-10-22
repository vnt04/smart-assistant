> **Status:** Draft — generated from development notes on 2026-10-21
> **Last updated:** 2026-10-21

# CI/CD với Docker Image và GHCR

## Context

Ban đầu, GitHub Actions chỉ chạy quality checks. Khi deploy, VPS checkout source code rồi tự build Docker image bằng `pnpm prod:build`.

Luồng cũ:

```text
CI kiểm tra code
→ VPS pull source
→ VPS build Docker image
→ Start containers
```

## Problem

Docker image bị build hai lần:

1. Một lần trong CI.
2. Một lần trên VPS.

Điều này làm deploy chậm hơn và image chạy trên VPS không chắc là image đã được kiểm tra trong CI.

## Decision

Chuyển sang mô hình build artifact một lần:

```text
CI quality checks
→ CI build Docker image
→ Push image lên GHCR
→ VPS pull image theo commit SHA
→ Migration
→ Health check
```

Production không còn build image từ source.

## Files Changed

- `.github/workflows/ci.yml`
  - Thêm job build và push backend/frontend images.
  - Chỉ push image sau khi quality job thành công.
  - Dùng commit SHA làm image tag.
- `.github/workflows/deploy.yml`
  - Không checkout source và build trên VPS nữa.
  - Login GHCR, pull image theo commit SHA, start container, chạy migration và health check.
- `docker-compose.prod.yml`
  - Backend/frontend chuyển từ `build:` sang `image:`.
  - Image được truyền qua `BACKEND_IMAGE` và `FRONTEND_IMAGE`.
- `docker-compose.yml`
  - Giữ nguyên để local vẫn build từ source.
- `package.json`
  - Loại bỏ script `prod:build` vì production không còn build image trên VPS.
- `docs/setup.md`
  - Cập nhật quy trình deploy và registry secrets.

## Important Decisions

- Dùng GHCR vì tích hợp với GitHub repository.
- Dùng commit SHA thay vì `latest` để truy vết image theo source commit.
- Chỉ job publish image có quyền `packages: write`.
- Pull request chỉ chạy quality checks, không push image.
- VPS chỉ cần Docker Compose và quyền pull private image.
- Migration không tự động rollback nếu deploy thất bại.

## Lessons Learned

- CI nên tạo artifact deployable; production chỉ sử dụng artifact đó.
- `build:` và `image:` có vai trò khác nhau trong Docker Compose.
- Tag image bằng commit SHA giúp truy vết và rollback application dễ hơn.
- Rollback application image không đồng nghĩa rollback database migration.
- Các biến bắt buộc như `BACKEND_IMAGE` nên fail fast khi thiếu.
- `.env.production` và registry token phải nằm ngoài repository.

## Current Flow

```text
Feature branch
→ Pull Request
→ CI quality checks
→ Merge develop
→ Build images
→ Push GHCR
→ Deploy staging
→ Test staging
→ Merge main
→ Build images
→ Push GHCR
→ Deploy production
```

## Follow-up

- Sửa lỗi `eslint: not found` trong môi trường CI.
- Chạy thử deploy staging thực tế.
- Xác minh GHCR package permissions.
- Cấu hình token chỉ có quyền pull image trên VPS.
- Cân nhắc chuyển từ SHA tag sang digest pinning.

## Related Documents

- CI/CD infrastructure → [`../infra/ci-cd/README.md`](../infra/ci-cd/README.md)
- Deployment setup → [`../setup.md`](../setup.md)
- Architecture index → [`../architecture.md`](../architecture.md)

## Document History

| Date | Change | Author |
|------|--------|--------|
| 2026-10-21 | Record CI/CD migration from VPS build to GHCR image deployment | Claude Code |
