import {
  aiConversationDetailSchema,
  aiConversationSchema,
  aiStreamEventSchema,
  aiToolCallSchema,
  attachmentSchema,
  authTokensSchema,
  budgetSchema,
  budgetStatusSchema,
  categorySchema,
  eventSchema,
  expenseByCategoryResponseSchema,
  healthCheckSchema,
  noteListResponseSchema,
  noteSchema,
  notebookSchema,
  reminderSchema,
  tagSchema,
  taskSchema,
  telegramTestSchema,
  transactionListResponseSchema,
  transactionSchema,
  trendResponseSchema,
  userProfileSchema,
  userSettingsSchema,
  walletSchema,
  type AiConversation,
  type AiConversationDetail,
  type AiStreamEvent,
  type AiToolCall,
  type Attachment,
  type AuthTokens,
  type Budget,
  type BudgetStatus,
  type Category,
  type ConfirmAiToolCallInput,
  type CreateAiConversationInput,
  type CreateBudgetInput,
  type CreateCategoryInput,
  type CreateEventInput,
  type CreateNoteInput,
  type CreateNotebookInput,
  type CreateReminderInput,
  type CreateTagInput,
  type CreateTaskInput,
  type CreateTransactionInput,
  type CreateWalletInput,
  type Event as EventDto,
  type EventListQuery,
  type ExpenseByCategoryQuery,
  type ExpenseByCategoryResponse,
  type ExportQuery,
  type HealthCheck,
  type LoginInput,
  type Note,
  type NoteListQuery,
  type NoteListResponse,
  type Notebook,
  type RegisterInput,
  type Reminder,
  type SendAiMessageInput,
  type Tag,
  type Task,
  type TaskListQuery,
  type TelegramTestResponse,
  type Transaction,
  type TransactionListQuery,
  type TransactionListResponse,
  type TrendQuery,
  type TrendResponse,
  type UpdateBudgetInput,
  type UpdateCategoryInput,
  type UpdateEventInput,
  type UpdateNoteInput,
  type UpdateNotebookInput,
  type UpdateSettingsInput,
  type UpdateTaskInput,
  type UpdateTransactionInput,
  type UpdateWalletInput,
  type UserProfile,
  type UserSettings,
  type Wallet,
} from "@assistant/shared";
import { z } from "zod";
import { tokenStorage } from "./storage";

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

let refreshInflight: Promise<AuthTokens | null> | null = null;

async function refreshAccessToken(): Promise<AuthTokens | null> {
  const stored = tokenStorage.load();
  if (!stored) return null;
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      });
      if (!res.ok) return null;
      const tokens = authTokensSchema.parse(await res.json());
      tokenStorage.save(tokens);
      return tokens;
    } catch {
      return null;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

async function rawRequest(
  path: string,
  init: RequestInit,
  withAuth: boolean,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (withAuth) {
    const tokens = tokenStorage.load();
    if (tokens?.accessToken) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal } = opts;
  const init: RequestInit = {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  };

  let res = await rawRequest(path, init, auth);

  if (res.status === 401 && auth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawRequest(path, init, true);
    } else {
      tokenStorage.clear();
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = parsed as
      | { code?: string; message?: string; details?: unknown }
      | null;
    throw new ApiError(
      res.status,
      err?.code ?? "http_error",
      err?.message ?? res.statusText,
      err?.details,
    );
  }

  return parsed as T;
}

export const api = {
  health: async (): Promise<HealthCheck> =>
    healthCheckSchema.parse(await request("/health", { auth: false })),

  register: async (input: RegisterInput): Promise<AuthTokens> =>
    authTokensSchema.parse(
      await request("/auth/register", {
        method: "POST",
        body: input,
        auth: false,
      }),
    ),

  login: async (input: LoginInput): Promise<AuthTokens> =>
    authTokensSchema.parse(
      await request("/auth/login", {
        method: "POST",
        body: input,
        auth: false,
      }),
    ),

  logout: async (refreshToken: string): Promise<void> =>
    request("/auth/logout", {
      method: "POST",
      body: { refreshToken },
      auth: false,
    }),

  me: async (): Promise<UserProfile> =>
    userProfileSchema.parse(await request("/auth/me")),

  getSettings: async (): Promise<UserSettings> =>
    userSettingsSchema.parse(await request("/auth/settings")),

  updateSettings: async (input: UpdateSettingsInput): Promise<UserSettings> =>
    userSettingsSchema.parse(
      await request("/auth/settings", { method: "PATCH", body: input }),
    ),

  // Notebooks
  listNotebooks: async (): Promise<Notebook[]> =>
    z.array(notebookSchema).parse(await request("/notebooks")),

  createNotebook: async (input: CreateNotebookInput): Promise<Notebook> =>
    notebookSchema.parse(
      await request("/notebooks", { method: "POST", body: input }),
    ),

  updateNotebook: async (
    id: string,
    input: UpdateNotebookInput,
  ): Promise<Notebook> =>
    notebookSchema.parse(
      await request(`/notebooks/${id}`, { method: "PATCH", body: input }),
    ),

  deleteNotebook: async (id: string): Promise<void> =>
    request(`/notebooks/${id}`, { method: "DELETE" }),

  // Tags
  listTags: async (): Promise<Tag[]> =>
    z.array(tagSchema).parse(await request("/tags")),

  createTag: async (input: CreateTagInput): Promise<Tag> =>
    tagSchema.parse(await request("/tags", { method: "POST", body: input })),

  deleteTag: async (id: string): Promise<void> =>
    request(`/tags/${id}`, { method: "DELETE" }),

  // Notes
  listNotes: async (query: Partial<NoteListQuery>): Promise<NoteListResponse> => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && `${v}`.length > 0) {
        params.set(k, String(v));
      }
    }
    const qs = params.toString();
    return noteListResponseSchema.parse(
      await request(`/notes${qs ? `?${qs}` : ""}`),
    );
  },

  getNote: async (id: string): Promise<Note> =>
    noteSchema.parse(await request(`/notes/${id}`)),

  createNote: async (input: CreateNoteInput): Promise<Note> =>
    noteSchema.parse(
      await request("/notes", { method: "POST", body: input }),
    ),

  updateNote: async (id: string, input: UpdateNoteInput): Promise<Note> =>
    noteSchema.parse(
      await request(`/notes/${id}`, { method: "PATCH", body: input }),
    ),

  deleteNote: async (id: string): Promise<void> =>
    request(`/notes/${id}`, { method: "DELETE" }),

  // Attachments
  uploadAttachment: async (
    noteId: string,
    file: File,
  ): Promise<Attachment> => {
    const form = new FormData();
    form.append("file", file);
    const headers = new Headers();
    const tokens = tokenStorage.load();
    if (tokens?.accessToken) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }
    let res = await fetch(`${API_BASE}/notes/${noteId}/attachments`, {
      method: "POST",
      body: form,
      headers,
    });
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
        res = await fetch(`${API_BASE}/notes/${noteId}/attachments`, {
          method: "POST",
          body: form,
          headers,
        });
      }
    }
    const text = await res.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = parsed as
        | { code?: string; message?: string; details?: unknown }
        | null;
      throw new ApiError(
        res.status,
        err?.code ?? "http_error",
        err?.message ?? res.statusText,
        err?.details,
      );
    }
    return attachmentSchema.parse(parsed);
  },

  deleteAttachment: async (id: string): Promise<void> =>
    request(`/attachments/${id}`, { method: "DELETE" }),

  attachmentUrl: (id: string): string => `${API_BASE}/attachments/${id}`,

  // Events
  listEvents: async (query: EventListQuery = {}): Promise<EventDto[]> => {
    const qs = toQuery(query);
    return z
      .array(eventSchema)
      .parse(await request(`/events${qs}`));
  },

  createEvent: async (input: CreateEventInput): Promise<EventDto> =>
    eventSchema.parse(
      await request("/events", { method: "POST", body: input }),
    ),

  updateEvent: async (
    id: string,
    input: UpdateEventInput,
  ): Promise<EventDto> =>
    eventSchema.parse(
      await request(`/events/${id}`, { method: "PATCH", body: input }),
    ),

  deleteEvent: async (id: string): Promise<void> =>
    request(`/events/${id}`, { method: "DELETE" }),

  // Tasks
  listTasks: async (query: TaskListQuery = {}): Promise<Task[]> => {
    const qs = toQuery(query);
    return z.array(taskSchema).parse(await request(`/tasks${qs}`));
  },

  createTask: async (input: CreateTaskInput): Promise<Task> =>
    taskSchema.parse(
      await request("/tasks", { method: "POST", body: input }),
    ),

  updateTask: async (id: string, input: UpdateTaskInput): Promise<Task> =>
    taskSchema.parse(
      await request(`/tasks/${id}`, { method: "PATCH", body: input }),
    ),

  deleteTask: async (id: string): Promise<void> =>
    request(`/tasks/${id}`, { method: "DELETE" }),

  // Reminders
  listReminders: async (): Promise<Reminder[]> =>
    z.array(reminderSchema).parse(await request("/reminders")),

  createReminder: async (input: CreateReminderInput): Promise<Reminder> =>
    reminderSchema.parse(
      await request("/reminders", { method: "POST", body: input }),
    ),

  deleteReminder: async (id: string): Promise<void> =>
    request(`/reminders/${id}`, { method: "DELETE" }),

  testTelegram: async (): Promise<TelegramTestResponse> =>
    telegramTestSchema.parse(
      await request("/reminders/telegram/test", { method: "POST" }),
    ),

  // Wallets
  listWallets: async (): Promise<Wallet[]> =>
    z.array(walletSchema).parse(await request("/wallets")),

  createWallet: async (input: CreateWalletInput): Promise<Wallet> =>
    walletSchema.parse(
      await request("/wallets", { method: "POST", body: input }),
    ),

  updateWallet: async (id: string, input: UpdateWalletInput): Promise<Wallet> =>
    walletSchema.parse(
      await request(`/wallets/${id}`, { method: "PATCH", body: input }),
    ),

  deleteWallet: async (id: string): Promise<void> =>
    request(`/wallets/${id}`, { method: "DELETE" }),

  // Categories
  listCategories: async (): Promise<Category[]> =>
    z.array(categorySchema).parse(await request("/categories")),

  createCategory: async (input: CreateCategoryInput): Promise<Category> =>
    categorySchema.parse(
      await request("/categories", { method: "POST", body: input }),
    ),

  updateCategory: async (
    id: string,
    input: UpdateCategoryInput,
  ): Promise<Category> =>
    categorySchema.parse(
      await request(`/categories/${id}`, { method: "PATCH", body: input }),
    ),

  deleteCategory: async (id: string): Promise<void> =>
    request(`/categories/${id}`, { method: "DELETE" }),

  // Transactions
  listTransactions: async (
    query: Partial<TransactionListQuery> = {},
  ): Promise<TransactionListResponse> => {
    const qs = toQuery(query);
    return transactionListResponseSchema.parse(
      await request(`/transactions${qs}`),
    );
  },

  createTransaction: async (
    input: CreateTransactionInput,
  ): Promise<Transaction> =>
    transactionSchema.parse(
      await request("/transactions", { method: "POST", body: input }),
    ),

  updateTransaction: async (
    id: string,
    input: UpdateTransactionInput,
  ): Promise<Transaction> =>
    transactionSchema.parse(
      await request(`/transactions/${id}`, { method: "PATCH", body: input }),
    ),

  deleteTransaction: async (id: string): Promise<void> =>
    request(`/transactions/${id}`, { method: "DELETE" }),

  // Budgets
  listBudgets: async (month?: string): Promise<BudgetStatus[]> => {
    const qs = toQuery(month ? { month } : {});
    return z.array(budgetStatusSchema).parse(await request(`/budgets${qs}`));
  },

  createBudget: async (input: CreateBudgetInput): Promise<Budget> =>
    budgetSchema.parse(
      await request("/budgets", { method: "POST", body: input }),
    ),

  updateBudget: async (id: string, input: UpdateBudgetInput): Promise<Budget> =>
    budgetSchema.parse(
      await request(`/budgets/${id}`, { method: "PATCH", body: input }),
    ),

  deleteBudget: async (id: string): Promise<void> =>
    request(`/budgets/${id}`, { method: "DELETE" }),

  // AI
  listAiConversations: async (): Promise<AiConversation[]> =>
    z.array(aiConversationSchema).parse(await request("/ai/conversations")),

  createAiConversation: async (
    input: CreateAiConversationInput = {},
  ): Promise<AiConversationDetail> =>
    aiConversationDetailSchema.parse(
      await request("/ai/conversations", { method: "POST", body: input }),
    ),

  getAiConversation: async (id: string): Promise<AiConversationDetail> =>
    aiConversationDetailSchema.parse(await request(`/ai/conversations/${id}`)),

  sendAiMessage: async (
    conversationId: string,
    input: SendAiMessageInput,
    onEvent: (event: AiStreamEvent) => void,
  ): Promise<void> => {
    const tokens = tokenStorage.load();
    const headers = new Headers({
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    });
    if (tokens?.accessToken) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }
    const res = await fetch(`${API_BASE}/ai/conversations/${conversationId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok || !res.body) {
      throw new ApiError(res.status, "ai_stream_failed", "Không gửi được tin nhắn");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const data = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data) onEvent(aiStreamEventSchema.parse(JSON.parse(data)));
      }
    }
  },

  confirmAiToolCall: async (
    id: string,
    input: ConfirmAiToolCallInput,
  ): Promise<AiToolCall> =>
    aiToolCallSchema.parse(
      await request(`/ai/tool-calls/${id}`, { method: "PATCH", body: input }),
    ),

  // Reports
  expenseByCategory: async (
    query: ExpenseByCategoryQuery,
  ): Promise<ExpenseByCategoryResponse> =>
    expenseByCategoryResponseSchema.parse(
      await request(`/reports/expense-by-category${toQuery(query)}`),
    ),

  trend: async (query: TrendQuery): Promise<TrendResponse> =>
    trendResponseSchema.parse(await request(`/reports/trend${toQuery(query)}`)),

  exportCsvUrl: (query: ExportQuery): string =>
    `${API_BASE}/reports/export.csv${toQuery(query)}`,

  downloadCsv: async (query: ExportQuery): Promise<Blob> => {
    const tokens = tokenStorage.load();
    const headers = new Headers();
    if (tokens?.accessToken) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }
    let res = await fetch(
      `${API_BASE}/reports/export.csv${toQuery(query)}`,
      { headers },
    );
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        headers.set("Authorization", `Bearer ${refreshed.accessToken}`);
        res = await fetch(
          `${API_BASE}/reports/export.csv${toQuery(query)}`,
          { headers },
        );
      }
    }
    if (!res.ok) {
      throw new ApiError(res.status, "csv_export_failed", "Không tải được CSV");
    }
    return res.blob();
  },
};

function toQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && `${v}`.length > 0) {
      params.set(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
