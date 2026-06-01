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
  UseGuards,
} from "@nestjs/common";
import {
  createNotebookInputSchema,
  updateNotebookInputSchema,
  verifyNotesLockInputSchema,
  type CreateNotebookInput,
  type Notebook,
  type UpdateNotebookInput,
  type VerifyNotesLockInput,
} from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { UserEntity } from "../users/entities/user.entity";
import { NotebooksService } from "./notebooks.service";

@Controller("notebooks")
@UseGuards(JwtAuthGuard)
export class NotebooksController {
  constructor(private readonly svc: NotebooksService) {}

  @Get()
  list(@CurrentUser() user: UserEntity): Promise<Notebook[]> {
    return this.svc.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: UserEntity,
    @Body(new ZodValidationPipe(createNotebookInputSchema))
    input: CreateNotebookInput,
  ): Promise<Notebook> {
    return this.svc.create(user.id, input);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateNotebookInputSchema))
    input: UpdateNotebookInput,
  ): Promise<Notebook> {
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

  @Post(":id/lock")
  @HttpCode(HttpStatus.OK)
  lock(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<Notebook> {
    return this.svc.lock(user.id, id);
  }

  @Post(":id/unlock")
  @HttpCode(HttpStatus.OK)
  unlock(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(verifyNotesLockInputSchema))
    input: VerifyNotesLockInput,
  ): Promise<Notebook> {
    return this.svc.unlock(user.id, id, input.password);
  }
}
