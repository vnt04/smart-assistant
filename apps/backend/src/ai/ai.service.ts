import { Injectable, MessageEvent, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Observable } from "rxjs";
import { Repository } from "typeorm";
import type {
  AiConversation,
  AiConversationDetail,
  AiMessage,
  AiStreamEvent,
  AiToolCall,
  ConfirmAiToolCallInput,
  CreateAiConversationInput,
  SendAiMessageInput,
} from "@assistant/shared";
import { SettingsService } from "../settings/settings.service";
import { AiProviderService, type AiProviderMessage } from "./ai-provider.service";
import { AiToolsService } from "./ai-tools.service";
import { AiConversationEntity } from "./entities/ai-conversation.entity";
import { AiMessageEntity } from "./entities/ai-message.entity";
import { AiToolCallEntity } from "./entities/ai-tool-call.entity";

@Injectable()
export class AiService {
  constructor(
    @InjectRepository(AiConversationEntity)
    private readonly conversations: Repository<AiConversationEntity>,
    @InjectRepository(AiMessageEntity)
    private readonly messages: Repository<AiMessageEntity>,
    @InjectRepository(AiToolCallEntity)
    private readonly toolCalls: Repository<AiToolCallEntity>,
    private readonly settings: SettingsService,
    private readonly provider: AiProviderService,
    private readonly tools: AiToolsService,
  ) {}

  async listConversations(userId: string): Promise<AiConversation[]> {
    const rows = await this.conversations.find({
      where: { userId },
      order: { updatedAt: "DESC" },
      take: 50,
    });
    return rows.map(toConversationDto);
  }

  async createConversation(
    userId: string,
    input: CreateAiConversationInput,
  ): Promise<AiConversationDetail> {
    const row = await this.conversations.save(
      this.conversations.create({ userId, title: input.title ?? "Đoạn chat mới" }),
    );
    return { ...toConversationDto(row), messages:[] };
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<AiConversationDetail> {
    const conversation = await this.findConversation(userId, conversationId);
    const messages = await this.messages.find({
      where: { conversationId },
      relations: { toolCalls: true },
      order: { createdAt: "ASC" },
    });
    return { ...toConversationDto(conversation), messages: messages.map(toMessageDto) };
  }

  streamMessage(
    userId: string,
    conversationId: string,
    input: SendAiMessageInput,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      void this.sendMessage(userId, conversationId, input)
        .then((events) => {
          for (const event of events) subscriber.next({ data: event });
          subscriber.complete();
        })
        .catch((err: unknown) => {
          subscriber.next({
            data: {
              type: "error",
              message: err instanceof Error ? err.message : "Không gửi được tin nhắn",
            },
          });
          subscriber.complete();
        });
    });
  }

  async confirmToolCall(
    userId: string,
    toolCallId: string,
    input: ConfirmAiToolCallInput,
  ): Promise<AiToolCall> {
    const row = await this.toolCalls
      .createQueryBuilder("tc")
      .innerJoin(AiMessageEntity, "m", "m.id = tc.message_id")
      .innerJoin(AiConversationEntity, "c", "c.id = m.conversation_id")
      .where("tc.id = :id", { id: toolCallId })
      .andWhere("c.user_id = :userId", { userId })
      .getOne();
    if (!row) {
      throw new NotFoundException({
        code: "tool_call_not_found",
        message: "Không tìm thấy tool call",
      });
    }
    if (!input.approved) {
      row.status = "rejected";
      row.executedAt = new Date();
      return toToolCallDto(await this.toolCalls.save(row));
    }
    row.result = await this.tools.execute(userId, row.name, row.arguments);
    row.status = "executed";
    row.executedAt = new Date();
    return toToolCallDto(await this.toolCalls.save(row));
  }

  private async sendMessage(
    userId: string,
    conversationId: string,
    input: SendAiMessageInput,
  ): Promise<AiStreamEvent[]> {
    const conversation = await this.findConversation(userId, conversationId);
    const userMessage = await this.messages.save(
      this.messages.create({
        conversationId,
        role: "user",
        content: input.content,
        provider: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
      }),
    );
    if (conversation.title === "Đoạn chat mới") {
      conversation.title = input.content.slice(0, 80);
      await this.conversations.save(conversation);
    } else {
      await this.conversations.update(conversation.id, { updatedAt: new Date() });
    }

    const history = await this.messages.find({
      where: { conversationId },
      order: { createdAt: "ASC" },
      take: 20,
    });
    const settings = await this.settings.getForUser(userId);
    const apiKey = await this.settings.decryptAiApiKey(userId);
    const result = await this.provider.complete(
      settings.aiProvider,
      apiKey,
      history.map(toProviderMessage),
    );
    const assistant = await this.messages.save(
      this.messages.create({
        conversationId,
        role: "assistant",
        content: result.content,
        provider: result.provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }),
    );
    const createdToolCalls = await Promise.all(
      result.toolCalls.map((toolCall) =>
        this.toolCalls.save(
          this.toolCalls.create({
            messageId: assistant.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            result: null,
            status: isCreateTool(toolCall.name) ? "pending" : "executed",
            executedAt: isCreateTool(toolCall.name) ? null : new Date(),
          }),
        ),
      ),
    );

    for (const toolCall of createdToolCalls) {
      if (toolCall.status === "executed") {
        toolCall.result = await this.tools.execute(userId, toolCall.name, toolCall.arguments);
        await this.toolCalls.save(toolCall);
      }
    }

    const detail = await this.getConversation(userId, conversationId);
    return [
      { type: "message", message: toMessageDto(userMessage) },
      { type: "delta", text: result.content },
      ...createdToolCalls.map((toolCall) => ({
        type: "tool_call" as const,
        toolCall: toToolCallDto(toolCall),
      })),
      { type: "done", conversation: detail },
    ];
  }

  private async findConversation(
    userId: string,
    conversationId: string,
  ): Promise<AiConversationEntity> {
    const row = await this.conversations.findOne({
      where: { id: conversationId, userId },
    });
    if (!row) {
      throw new NotFoundException({
        code: "conversation_not_found",
        message: "Không tìm thấy hội thoại",
      });
    }
    return row;
  }
}

function toConversationDto(row: AiConversationEntity): AiConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessageDto(row: AiMessageEntity): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt.toISOString(),
    toolCalls: (row.toolCalls ?? []).map(toToolCallDto),
  };
}

function toToolCallDto(row: AiToolCallEntity): AiToolCall {
  return {
    id: row.id,
    messageId: row.messageId,
    name: row.name,
    arguments: row.arguments,
    result: row.result,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    executedAt: row.executedAt ? row.executedAt.toISOString() : null,
  };
}

function toProviderMessage(row: AiMessageEntity): AiProviderMessage {
  return { role: row.role, content: row.content };
}

function isCreateTool(name: string): boolean {
  return name.startsWith("create");
}
