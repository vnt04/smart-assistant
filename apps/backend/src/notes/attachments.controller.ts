import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { Attachment } from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { UserEntity } from "../users/entities/user.entity";
import {
  AttachmentsService,
  type UploadFile,
} from "./attachments.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  @Get("notes/:noteId/attachments")
  list(
    @CurrentUser() user: UserEntity,
    @Param("noteId", new ParseUUIDPipe()) noteId: string,
  ): Promise<Attachment[]> {
    return this.svc.listForNote(user.id, noteId);
  }

  @Post("notes/:noteId/attachments")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @CurrentUser() user: UserEntity,
    @Param("noteId", new ParseUUIDPipe()) noteId: string,
    @UploadedFile() file: UploadFile,
  ): Promise<Attachment> {
    return this.svc.upload(user.id, noteId, file);
  }

  @Get("attachments/:id")
  async download(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { absPath, entity } = await this.svc.openStream(user.id, id);
    res.setHeader("Content-Type", entity.mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(entity.originalName)}`,
    );
    res.sendFile(absPath);
  }

  @Delete("attachments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.svc.remove(user.id, id);
  }
}
