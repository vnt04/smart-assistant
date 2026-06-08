import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { Request } from "express";
import type { UserEntity } from "../../users/entities/user.entity";

// Trả về user nếu request đã xác thực (qua OptionalJwtAuthGuard), ngược lại null.
// Khác với CurrentUser (ném lỗi khi thiếu user) — dùng cho route công khai.
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserEntity | null => {
    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: UserEntity }>();
    return req.user ?? null;
  },
);
