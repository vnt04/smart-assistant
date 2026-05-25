-- Ensure database uses utf8mb4 with case-insensitive Unicode collation.
-- Runs once on first container start (when data volume is empty).
ALTER DATABASE assistant
  CHARACTER SET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
