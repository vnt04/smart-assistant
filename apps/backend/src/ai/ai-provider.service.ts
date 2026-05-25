import { Injectable } from "@nestjs/common";
import type { AiProvider, AiToolName } from "@assistant/shared";

export interface AiProviderMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

export interface AiProviderToolCall {
  name: AiToolName;
  arguments: Record<string, unknown>;
}

export interface AiProviderResult {
  content: string;
  provider: AiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCalls: AiProviderToolCall[];
}

@Injectable()
export class AiProviderService {
  async complete(
    provider: AiProvider,
    apiKey: string | null,
    messages: AiProviderMessage[],
  ): Promise<AiProviderResult> {
    if (!apiKey && provider !== "ollama") {
      return localResult(provider, messages);
    }

    if (provider === "claude") return this.completeClaude(apiKey, messages);
    if (provider === "openai") return this.completeOpenAi(apiKey, messages);
    return this.completeOllama(messages);
  }

  private async completeClaude(
    apiKey: string | null,
    messages: AiProviderMessage[],
  ): Promise<AiProviderResult> {
    if (!apiKey) return localResult("claude", messages);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1200,
        system: systemPrompt,
        messages: messages.map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: message.content,
        })),
      }),
    });
    if (!res.ok) return localResult("claude", messages);
    const json = (await res.json()) as ClaudeResponse;
    const content = json.content
      ?.map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();
    return {
      content: content || fallbackText(messages),
      provider: "claude",
      model: json.model ?? "claude-3-5-sonnet-20241022",
      inputTokens: json.usage?.input_tokens ?? null,
      outputTokens: json.usage?.output_tokens ?? null,
      toolCalls: detectToolCalls(messages),
    };
  }

  private async completeOpenAi(
    apiKey: string | null,
    messages: AiProviderMessage[],
  ): Promise<AiProviderResult> {
    if (!apiKey) return localResult("openai", messages);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({
            role: message.role === "tool" ? "user" : message.role,
            content: message.content,
          })),
        ],
      }),
    });
    if (!res.ok) return localResult("openai", messages);
    const json = (await res.json()) as OpenAiResponse;
    return {
      content: json.choices?.[0]?.message?.content ?? fallbackText(messages),
      provider: "openai",
      model: json.model ?? "gpt-4o-mini",
      inputTokens: json.usage?.prompt_tokens ?? null,
      outputTokens: json.usage?.completion_tokens ?? null,
      toolCalls: detectToolCalls(messages),
    };
  }

  private async completeOllama(
    messages: AiProviderMessage[],
  ): Promise<AiProviderResult> {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "llama3.1",
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => ({
            role: message.role === "tool" ? "user" : message.role,
            content: message.content,
          })),
        ],
      }),
    }).catch(() => null);
    if (!res?.ok) return localResult("ollama", messages);
    const json = (await res.json()) as OllamaResponse;
    return {
      content: json.message?.content ?? fallbackText(messages),
      provider: "ollama",
      model: json.model ?? "llama3.1",
      inputTokens: null,
      outputTokens: null,
      toolCalls: detectToolCalls(messages),
    };
  }
}

const systemPrompt =
  "Bạn là trợ lý cá nhân tiếng Việt. Trả lời ngắn gọn, ưu tiên dữ liệu notes, lịch và chi tiêu của người dùng. Nếu cần tạo dữ liệu mới, hãy nói rõ cần xác nhận.";

type ClaudeResponse = {
  model?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type OpenAiResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type OllamaResponse = {
  model?: string;
  message?: { content?: string };
};

function localResult(
  provider: AiProvider,
  messages: AiProviderMessage[],
): AiProviderResult {
  return {
    content: fallbackText(messages),
    provider,
    model: "local-rule-based",
    inputTokens: null,
    outputTokens: null,
    toolCalls: detectToolCalls(messages),
  };
}

function fallbackText(messages: AiProviderMessage[]): string {
  const latest = messages.at(-1)?.content.toLowerCase() ?? "";
  if (latest.includes("chi") || latest.includes("tiền")) {
    return "Mình có thể tra cứu chi tiêu, ngân sách hoặc tạo giao dịch sau khi bạn xác nhận thông tin ví, danh mục và số tiền.";
  }
  if (latest.includes("lịch") || latest.includes("task") || latest.includes("việc")) {
    return "Mình có thể xem lịch, tạo sự kiện hoặc tạo task. Nếu muốn tạo mới, mình sẽ hiển thị bản nháp để bạn xác nhận trước.";
  }
  if (latest.includes("note") || latest.includes("ghi chú")) {
    return "Mình có thể tìm kiếm hoặc tóm tắt ghi chú của bạn. Hãy cho mình từ khóa hoặc danh sách ghi chú cần xử lý.";
  }
  return "Mình đã sẵn sàng hỗ trợ notes, lịch và chi tiêu. Bạn muốn mình làm gì trước?";
}

function detectToolCalls(messages: AiProviderMessage[]): AiProviderToolCall[] {
  const latest = messages.at(-1)?.content ?? "";
  const lower = latest.toLowerCase();
  if (lower.includes("tìm") && (lower.includes("note") || lower.includes("ghi chú"))) {
    return [{ name: "searchNotes", arguments: { query: latest.slice(0, 200) } }];
  }
  return[];
}
