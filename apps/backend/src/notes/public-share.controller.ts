import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import type { SharedNotePayload, SharedResource } from "@assistant/shared";
import { OptionalUser } from "../auth/decorators/optional-user.decorator";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";
import type { UserEntity } from "../users/entities/user.entity";
import { SharesService } from "./shares.service";

// Route công khai cho người nhận link. Không bắt buộc đăng nhập; nếu có JWT thì
// dùng email để kiểm tra quyền với share giới hạn theo email.
@Controller("share")
@UseGuards(OptionalJwtAuthGuard)
export class PublicShareController {
  constructor(private readonly svc: SharesService) {}

  @Get(":token")
  resolve(
    @OptionalUser() user: UserEntity | null,
    @Param("token") token: string,
  ): Promise<SharedResource> {
    return this.svc.resolve(token, user?.email ?? null);
  }

  @Get(":token/notes/:noteId")
  resolveNote(
    @OptionalUser() user: UserEntity | null,
    @Param("token") token: string,
    @Param("noteId", new ParseUUIDPipe()) noteId: string,
  ): Promise<SharedNotePayload> {
    return this.svc.resolveNote(token, noteId, user?.email ?? null);
  }
}
