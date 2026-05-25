import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createNoteInputSchema,
  noteListQuerySchema,
  updateNoteInputSchema,
  type CreateNoteInput,
  type Note,
  type NoteListQuery,
  type NoteListResponse,
  type UpdateNoteInput,
} from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { UserEntity } from "../users/entities/user.entity";
import { NotesService } from "./notes.service";

@Controller("notes")
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private readonly svc: NotesService) {}

  @Get()
  list(
    @CurrentUser() user: UserEntity,
    @Query(new ZodValidationPipe(noteListQuerySchema)) query: NoteListQuery,
  ): Promise<NoteListResponse> {
    return this.svc.list(user.id, query);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<Note> {
    return this.svc.findOne(user.id, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: UserEntity,
    @Body(new ZodValidationPipe(createNoteInputSchema))
    input: CreateNoteInput,
  ): Promise<Note> {
    return this.svc.create(user.id, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateNoteInputSchema))
    input: UpdateNoteInput,
  ): Promise<Note> {
    return this.svc.update(user.id, id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.svc.remove(user.id, id);
  }
}
