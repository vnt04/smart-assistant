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
- TCP 22 (SSH)

Production stack KHÔNG chạy MySQL trong Docker. Backend container kết nối tới MySQL native cài trên host (qua `host.docker.internal` → docker bridge gateway → MySQL listening trên host).

Yêu cầu MySQL trên host:

- MySQL 8.0+ đã cài và đang chạy (`systemctl status mysql`).
- Bind-address cho phép Docker bridge connect (mặc định `0.0.0.0` là OK; nếu `127.0.0.1` thì sửa thành `0.0.0.0` trong `/etc/mysql/mysql.conf.d/mysqld.cnf`).
- Firewall: **đóng port 3306 ra internet**, chỉ mở cho `docker0`:

  ```bash
  sudo ufw deny 3306
  sudo ufw allow in on docker0 to any port 3306
  ```

- Tạo DB + user app:

  ```sql
  CREATE DATABASE assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'assistant'@'172.%.%.%' IDENTIFIED BY '<password mạnh>';
  GRANT ALL ON assistant.* TO 'assistant'@'172.%.%.%';
  FLUSH PRIVILEGES;
  ```

  Source `'172.%.%.%'` giới hạn user app chỉ connect được từ Docker bridge subnet, không từ internet.

- Quản lý DB tập trung qua DBeaver/TablePlus: dùng SSH tunnel → MySQL `127.0.0.1:3306` với admin user riêng. Đừng tạo `root@%` hoặc admin user `@%` — nguy cơ brute-force.

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
- `MYSQL_HOST`: `host.docker.internal` (backend Docker → MySQL native trên host qua bridge gateway). Hoặc IP public của server nếu cần override.
- `MYSQL_PORT`: thường `3306`
- `MYSQL_DATABASE`: `assistant`
- `MYSQL_USER`: `assistant` (user app đã tạo ở 3.1)
- `MYSQL_PASSWORD`: password mạnh của `assistant` user

Không commit `.env.production`.

### 3.3. Build image production

```bash
pnpm prod:build
```

### 3.4. Khởi động stack sau nginx host

Production stack không bind public port 80/443. Frontend và backend chỉ mở port trên localhost để nginx host reverse proxy:

- Frontend: `127.0.0.1:${FRONTEND_HOST_PORT:-8081}`
- Backend: `127.0.0.1:${BACKEND_HOST_PORT:-3001}`

Khởi động stack:

```bash
pnpm prod:up
```

Tạo nginx server block trên host cho `APP_DOMAIN`:

```nginx
server {
  listen 80;
  server_name assistant.example.com;

  location /api/ {
    proxy_pass http://127.0.0.1:3001/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Kiểm tra và reload nginx host:

```bash
nginx -t
systemctl reload nginx
```

Cấp HTTPS bằng certbot nginx plugin trên host:

```bash
certbot --nginx -d <APP_DOMAIN>
```

Kiểm tra health:

```bash
curl https://<APP_DOMAIN>/api/health
```

### 3.5. Chạy migration production

Sau khi backend container đã chạy, chạy TypeORM migrations trong backend container:

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

Gia hạn certificate bằng certbot trên host:

```bash
certbot renew
systemctl reload nginx
```

Nên đặt cron trên server chạy lệnh renew hằng ngày hoặc hằng tuần.

### 3.7. Deploy khi có update code mới

Khi có code mới trên branch production, SSH vào server và pull code mới:

```bash
git pull
```

Build lại image và khởi động lại stack:

```bash
pnpm prod:build
pnpm prod:up
```

Nếu update có thay đổi database schema, chạy migration sau khi backend đã lên:

```bash
pnpm prod:migrate
```

Kiểm tra health và xem logs nếu cần:

```bash
curl https://<APP_DOMAIN>/api/health
pnpm prod:logs
```

Nếu update có thay đổi `.env.production.example`, đối chiếu và bổ sung biến mới vào `.env.production` trên server trước khi chạy `pnpm prod:up`.

## 4. Backup và restore

### 4.1. Backup thủ công

```bash
pnpm prod:backup
```

Service `backup` chạy `mysqldump` từ container, kết nối tới `${MYSQL_HOST}` (MySQL native trên host) bằng `${MYSQL_USER}`/`${MYSQL_PASSWORD}` trong `.env.production`. User app `assistant` chỉ có quyền trên DB `assistant` nên dump chỉ chứa schema/data của project này.

Backup được ghi vào `./backups/YYYYMMDDTHHMMSSZ/` gồm:

- `mysql.sql`: dump MySQL
- `uploads.tar.gz`: archive uploads
- `manifest.txt`: metadata backup

`BACKUP_RETENTION_DAYS` trong `.env.production` điều khiển số ngày giữ backup cũ.

Lưu ý: backup của các DB khác trên host MySQL (vd Laravel project khác) **không** được dump bởi script này — mỗi project tự backup DB của mình. Hoặc setup mysqldump cron trên host trực tiếp với admin user.

### 4.2. Restore

Dừng backend/frontend trước khi restore để tránh ghi dữ liệu trong lúc khôi phục:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend frontend
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
