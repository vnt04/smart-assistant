import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { UserEntity } from "../../users/entities/user.entity";

// Xác thực "tùy chọn": nếu request có JWT hợp lệ thì gắn user, nếu không (hoặc
// token sai/hết hạn) thì để null thay vì ném lỗi. Dùng cho các route share công
// khai cần biết người dùng nếu họ đã đăng nhập.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<TUser = UserEntity>(
    _err: unknown,
    user: TUser | false | null,
  ): TUser | null {
    return user || null;
  }
}
