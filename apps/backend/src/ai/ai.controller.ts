import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Sse,
  UseGuards,
} from "@nestjs/common";
import type { Observable } from "rxjs";
import {
  confirmAiToolCallInputSchema,
  createAiConversationInputSchema,
  sendAiMessageInputSchema,
  type AiConversation,
  type AiConversationDetail,
  type AiStreamEvent,
  type AiToolCall,
  type ConfirmAiToolCallInput,
  type CreateAiConversationInput,
  type SendAiMessageInput,
} from "@assistant/shared";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import type { UserEntity } from "../users/entities/user.entity";
import { AiService } from "./ai.service";

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("conversations")
  list(@CurrentUser() user: UserEntity): Promise<AiConversation[]> {
    return this.ai.listConversations(user.id);
  }

  @Post("conversations")
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: UserEntity,
    @Body(new ZodValidationPipe(createAiConversationInputSchema))
    input: CreateAiConversationInput,
  ): Promise<AiConversationDetail> {
    return this.ai.createConversation(user.id, input);
  }

  @Get("conversations/:id")
  get(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
  ): Promise<AiConversationDetail> {
    return this.ai.getConversation(user.id, id);
  }

  @Post("conversations/:id/messages")
  @Sse()
  message(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(sendAiMessageInputSchema)) input: SendAiMessageInput,
  ): Observable<MessageEvent> {
    return this.ai.streamMessage(user.id, id, input);
  }

  @Patch("tool-calls/:id")
  confirmToolCall(
    @CurrentUser() user: UserEntity,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(confirmAiToolCallInputSchema))
    input: ConfirmAiToolCallInput,
  ): Promise<AiToolCall> {
    return this.ai.confirmToolCall(user.id, id, input);
  }
}
