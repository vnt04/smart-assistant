import { useEffect, useMemo, useState } from "react";
import type { AiConversation, AiConversationDetail, AiMessage, AiToolCall } from "@assistant/shared";
import { Button } from "../components/ui/button";
import { api, ApiError } from "../lib/api";

export function AssistantPage() {
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [active, setActive] = useState<AiConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadInitial();
  },[]);

  const pendingTools = useMemo(
    () =>
      active?.messages.flatMap((message) =>
        message.toolCalls.filter((tool) => tool.status === "pending"),
      ) ?? [],
    [active],
  );

  async function loadInitial(): Promise<void> {
    try {
      const items = await api.listAiConversations();
      setConversations(items);
      if (items[0]) {
        setActive(await api.getAiConversation(items[0].id));
      } else {
        const created = await api.createAiConversation();
        setActive(created);
        setConversations([created]);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  }

  async function createConversation(): Promise<void> {
    const created = await api.createAiConversation();
    setActive(created);
    setConversations((items) => [created, ...items]);
    setDraft("");
    setStreamingText("");
  }

  async function openConversation(id: string): Promise<void> {
    setActive(await api.getAiConversation(id));
    setStreamingText("");
  }

  async function send(): Promise<void> {
    if (!active || !draft.trim() || isSending) return;
    const content = draft.trim();
    setDraft("");
    setError(null);
    setStreamingText("");
    setIsSending(true);
    const optimistic: AiMessage = {
      id: `local-${Date.now()}`,
      conversationId: active.id,
      role: "user",
      content,
      provider: null,
      model: null,
      inputTokens: null,
      outputTokens: null,
      createdAt: new Date().toISOString(),
      toolCalls: [],
    };
    setActive({ ...active, messages: [...active.messages, optimistic] });
    try {
      await api.sendAiMessage(active.id, { content }, (event) => {
        if (event.type === "delta") setStreamingText(event.text);
        if (event.type === "done") {
          setActive(event.conversation);
          setStreamingText("");
          void api.listAiConversations().then(setConversations);
        }
        if (event.type === "error") setError(event.message);
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  }

  async function confirmTool(tool: AiToolCall, approved: boolean): Promise<void> {
    const updated = await api.confirmAiToolCall(tool.id, { approved });
    if (!active) return;
    setActive({
      ...active,
      messages: active.messages.map((message) => ({
        ...message,
        toolCalls: message.toolCalls.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      })),
    });
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-57px)] max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-3xl border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">AI</p>
            <h1 className="text-xl font-semibold">Trợ lý</h1>
          </div>
          <Button size="sm" onClick={() => void createConversation()}>
            Mới
          </Button>
        </div>
        <div className="space-y-2">
          {conversations.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openConversation(item.id)}
              className={`w-full rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-accent ${active?.id === item.id ? "bg-accent" : ""}`}
            >
              <p className="line-clamp-2 font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(item.updatedAt).toLocaleString("vi-VN")}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-xl">
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-sm text-emerald-200">Notes · Lịch · Chi tiêu</p>
          <h2 className="text-2xl font-semibold">{active?.title ?? "Trợ lý cá nhân"}</h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {active?.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {streamingText ? (
            <div className="max-w-[85%] rounded-3xl bg-white/10 px-4 py-3 text-sm leading-6">
              {streamingText}
            </div>
          ) : null}
          {pendingTools.length > 0 ? (
            <div className="space-y-3 rounded-3xl border border-amber-300/40 bg-amber-300/10 p-4">
              <p className="font-medium text-amber-100">Cần xác nhận trước khi tạo dữ liệu</p>
              {pendingTools.map((tool) => (
                <div key={tool.id} className="rounded-2xl bg-black/20 p-3">
                  <p className="text-sm font-semibold">{toolLabel(tool.name)}</p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-amber-50/90">
                    {JSON.stringify(tool.arguments, null, 2)}
                  </pre>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => void confirmTool(tool, true)}>
                      Xác nhận
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void confirmTool(tool, false)}>
                      Từ chối
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {error ? <p className="rounded-2xl bg-red-500/20 px-4 py-3 text-sm">{error}</p> : null}
        </div>

        <div className="border-t border-white/10 bg-black/20 p-4">
          <div className="flex gap-2 rounded-3xl bg-white p-2 text-slate-950">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder="Hỏi về ghi chú, lịch, ngân sách hoặc giao dịch..."
              className="min-h-12 flex-1 resize-none rounded-2xl px-3 py-2 outline-none"
            />
            <Button disabled={isSending || !draft.trim()} onClick={() => void send()}>
              Gửi
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MessageBubble({ message }: { message: AiMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 ${isUser ? "bg-emerald-400 text-slate-950" : "bg-white/10"}`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.toolCalls.length > 0 ? (
          <div className="mt-3 space-y-2 border-t border-white/10 pt-2 text-xs opacity-90">
            {message.toolCalls.map((tool) => (
              <p key={tool.id}>{toolLabel(tool.name)} · {toolStatus(tool.status)}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    searchNotes: "Tìm ghi chú",
    createNote: "Tạo ghi chú",
    listSchedule: "Xem lịch",
    createEvent: "Tạo sự kiện",
    createTask: "Tạo task",
    queryExpenses: "Tra cứu chi tiêu",
    createTransaction: "Tạo giao dịch",
    getBudgetStatus: "Xem ngân sách",
    summarizeNotes: "Tóm tắt ghi chú",
    getMonthlyInsights: "Phân tích tháng",
  };
  return labels[name] ?? name;
}

function toolStatus(status: string): string {
  if (status === "pending") return "chờ xác nhận";
  if (status === "executed") return "đã chạy";
  return "đã từ chối";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Có lỗi xảy ra";
}
