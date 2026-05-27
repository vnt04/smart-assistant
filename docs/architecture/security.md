# Security Architecture

Security is centered on JWT authentication, user-scoped data access, schema validation and environment-based secret management.

## Authentication

- Protected API endpoints use `JwtAuthGuard`.
- Current user is injected through `@CurrentUser()`.
- Frontend sends `Authorization: Bearer <accessToken>`.
- Refresh tokens are rotated through `/api/auth/refresh`.
- Logout revokes the refresh token.

## Authorization and ownership

Every user-owned resource must be queried with the authenticated `userId`. Nested resources must verify their parent ownership before read/write operations.

Examples:

- Notes are fetched with `{ id, userId }`.
- Attachments verify the note owner before upload.
- Attachment download looks up `{ id, userId }`.
- Notebook parent IDs are verified under the same user.

## Validation

Validation happens at system boundaries:

- Backend request body/query validation uses Zod schemas from `@assistant/shared`.
- Backend route IDs use UUID parsing.
- Frontend parses API responses with the same shared schemas.
- File uploads validate presence, size and MIME type before writing to disk.

## Secrets

Secrets must come from environment variables or encrypted user settings. Do not hardcode API keys, JWT secrets, OAuth credentials or Telegram tokens in source code or docs.

## File safety

Attachments are stored under `UPLOAD_DIR`. The backend stores a relative path and resolves it through a safe join check before download/delete to prevent path traversal.

## Data exposure rules

Do not expose these fields in API DTOs:

- Password hashes.
- Refresh token hashes.
- Encryption keys or encrypted raw secret blobs.
- Attachment `storedPath`.
- Provider credentials.

## Production checklist

Before deploying:

- Set strong `JWT_*_SECRET` values.
- Set a valid `ENCRYPTION_KEY`.
- Use HTTPS through Nginx/Certbot.
- Restrict CORS to trusted frontend origins.
- Persist and back up MySQL data.
- Persist and back up `UPLOAD_DIR` if attachments matter.
