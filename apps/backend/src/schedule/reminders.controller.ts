import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  createReminderInputSchema,
  type CreateReminderInput,
  type Reminder as ReminderDto,
  type TelegramTestResponse,
} from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { UserEntity } from "../users/entities/user.entity";
import { RemindersService } from "./reminders.service";
import { TelegramService } from "./telegram.service";

@Controller("reminders")
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(
    private readonly svc: RemindersService,
    private readonly telegram: TelegramService,
  ) {}

  @Get()
  list(@CurrentUser() user: UserEntity): Promise<ReminderDto[]> {
    return this.svc.listForUser(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: UserEntity,
    @Body(new ZodValidationPipe(createReminderInputSchema))
    input: CreateReminderInput,
  ): Promise<ReminderDto> {
    return this.svc.create(user.id, input);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.svc.remove(user.id, id);
  }

  @Post("telegram/test")
  @HttpCode(HttpStatus.OK)
  async testTelegram(
    @CurrentUser() user: UserEntity,
  ): Promise<TelegramTestResponse> {
    return this.telegram.sendTest(user.id);
  }
}
