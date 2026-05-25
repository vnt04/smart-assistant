# Setup local và production

Tài liệu này mô tả cách chạy Personal Assistant ở môi trường local và production.

## 1. Yêu cầu chung

- Node.js >= 20.11
- pnpm >= 9
- Docker + Docker Compose
- Domain trỏ A record về máy chủ production nếu bật HTTPS

## 2. Setup local

### 2.1. Cài dependencies

```bash
pnpm install
```

### 2.2. Tạo file môi trường

```bash
cp .env.example .env
```

Cập nhật các biến bắt buộc trong `.env`:

- `JWT_ACCESS_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự
- `JWT_REFRESH_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự
- `ENCRYPTION_KEY`: 64 ký tự hex
- `MYSQL_PASSWORD`: mật khẩu MySQL local

Tạo `ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2.3. Chạy MySQL và Redis local

```bash
pnpm docker:up
```

Kiểm tra logs nếu cần:

```bash
pnpm docker:logs
```

### 2.4. Build shared/backend và chạy migration

```bash
pnpm --filter @assistant/shared build
pnpm --filter @assistant/backend build
pnpm --filter @assistant/backend migration:run
```

### 2.5. Chạy app local

```bash
pnpm dev
```

Địa chỉ mặc định:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/api/health`

## 3. Setup production

### 3.1. Chuẩn bị server

Trên server Linux, cài Docker và Docker Compose plugin. Mở firewall cho:

- TCP 80
- TCP 443

Clone source code lên server và checkout branch cần deploy.

### 3.2. Tạo `.env.production`

```bash
cp .env.production.example .env.production
```

Cập nhật các biến production:

- `APP_DOMAIN`: domain public, ví dụ `assistant.example.com`
- `CERTBOT_EMAIL`: email nhận thông báo Let's Encrypt
- `BACKEND_PUBLIC_URL`: `https://<APP_DOMAIN>`
- `GOOGLE_CALLBACK_URL`: `https://<APP_DOMAIN>/api/auth/google/callback` nếu dùng Google OAuth
- `JWT_ACCESS_SECRET`: secret mạnh, không dùng giá trị mẫu
- `JWT_REFRESH_SECRET`: secret mạnh, không dùng giá trị mẫu
- `ENCRYPTION_KEY`: 64 ký tự hex
- `MYSQL_PASSWORD`: mật khẩu user app
- `MYSQL_ROOT_PASSWORD`: mật khẩu root MySQL

Không commit `.env.production`.

### 3.3. Build image production

```bash
pnpm prod:build
```

### 3.4. Khởi động lần đầu để lấy chứng chỉ HTTPS

Template Nginx production cần certificate tồn tại trước khi Nginx HTTPS chạy được. Quy trình lần đầu:

1. Đảm bảo port 80 chưa bị process nào chiếm, sau đó tạo certificate bằng Certbot standalone:

```bash
pnpm prod:certbot:init
```

2. Khởi động toàn bộ stack gồm Nginx HTTPS:

```bash
pnpm prod:up
```

3. Kiểm tra health:

```bash
curl https://<APP_DOMAIN>/api/health
```

### 3.5. Chạy migration production

Sau khi backend container đã chạy:

```bash
pnpm prod:migrate
```

### 3.6. Logs và vận hành

Xem logs:

```bash
pnpm prod:logs
```

Dừng stack, giữ volumes:

```bash
pnpm prod:down
```

Gia hạn certificate:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile certbot run --rm certbot renew --webroot -w /var/www/certbot
pnpm prod:up
```

Nên đặt cron trên server chạy lệnh renew hằng ngày hoặc hằng tuần.

## 4. Backup và restore

### 4.1. Backup thủ công

```bash
pnpm prod:backup
```

Backup được ghi vào `./backups/YYYYMMDDTHHMMSSZ/` gồm:

- `mysql.sql`: dump MySQL
- `uploads.tar.gz`: archive uploads
- `manifest.txt`: metadata backup

`BACKUP_RETENTION_DAYS` trong `.env.production` điều khiển số ngày giữ backup cũ.

### 4.2. Restore

Dừng backend/frontend trước khi restore để tránh ghi dữ liệu trong lúc khôi phục:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend frontend nginx
```

Restore từ một thư mục backup:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile backup run --rm --entrypoint "/bin/sh /scripts/restore.sh /backups/YYYYMMDDTHHMMSSZ" backup
```

Khởi động lại stack:

```bash
pnpm prod:up
```

## 5. Checklist sau deploy

- `https://<APP_DOMAIN>/api/health` trả về OK
- Đăng ký hoặc đăng nhập được
- Upload attachment trong Notes hoạt động
- Tạo event/task và reminder không lỗi
- Tạo transaction/budget expense hoạt động
- AI Assistant stream được phản hồi nếu provider đã cấu hình
- Backup tạo được thư mục mới trong `./backups`
