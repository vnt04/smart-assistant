import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";
import { transactionKindSchema } from "./transactions.js";

export const aiRoleSchema = z.enum(["user", "assistant", "tool"]);
export type AiRole = z.infer<typeof aiRoleSchema>;

export const aiConversationSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(255),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type AiConversation = z.infer<typeof aiConversationSchema>;

export const aiToolNameSchema = z.enum([
  "searchNotes",
  "createNote",
  "listSchedule",
  "createEvent",
  "createTask",
  "queryExpenses",
  "createTransaction",
  "getBudgetStatus",
  "summarizeNotes",
  "getMonthlyInsights",
]);
export type AiToolName = z.infer<typeof aiToolNameSchema>;

export const aiToolStatusSchema = z.enum(["pending", "executed", "rejected"]);
export type AiToolStatus = z.infer<typeof aiToolStatusSchema>;

export const aiToolCallSchema = z.object({
  id: idSchema,
  messageId: idSchema,
  name: aiToolNameSchema,
  arguments: z.record(z.unknown()),
  result: z.unknown().nullable(),
  status: aiToolStatusSchema,
  createdAt: isoDateTimeSchema,
  executedAt: isoDateTimeSchema.nullable(),
});
export type AiToolCall = z.infer<typeof aiToolCallSchema>;

export const aiMessageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  role: aiRoleSchema,
  content: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  createdAt: isoDateTimeSchema,
  toolCalls: z.array(aiToolCallSchema).default([]),
});
export type AiMessage = z.infer<typeof aiMessageSchema>;

export const aiConversationDetailSchema = aiConversationSchema.extend({
  messages: z.array(aiMessageSchema),
});
export type AiConversationDetail = z.infer<typeof aiConversationDetailSchema>;

export const createAiConversationInputSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
  })
  .strict();
export type CreateAiConversationInput = z.infer<
  typeof createAiConversationInputSchema
>;

export const sendAiMessageInputSchema = z
  .object({
    content: z.string().trim().min(1).max(20_000),
  })
  .strict();
export type SendAiMessageInput = z.infer<typeof sendAiMessageInputSchema>;

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const aiToolInputSchemas = {
  searchNotes: z.object({
    query: z.string().trim().min(1).max(200),
    tags: z.array(z.string().trim().min(1).max(50)).optional(),
    notebookId: idSchema.optional(),
  }),
  createNote: z.object({
    title: z.string().trim().min(1).max(255),
    content: z.string().max(2_000_000),
    notebookId: idSchema.nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  }),
  listSchedule: z.object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
  }),
  createEvent: z.object({
    title: z.string().trim().min(1).max(255),
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    reminder: z.boolean().optional(),
  }),
  createTask: z.object({
    title: z.string().trim().min(1).max(255),
    priority: z.enum(["low", "medium", "high"]).optional(),
    deadline: isoDateTimeSchema.optional(),
  }),
  queryExpenses: z.object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    categoryId: idSchema.optional(),
    walletId: idSchema.optional(),
  }),
  createTransaction: z.object({
    kind: transactionKindSchema,
    amount: z.number().int().positive().max(999_999_999_999_999),
    walletId: idSchema,
    categoryId: idSchema.nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }),
  getBudgetStatus: z.object({
    month: monthSchema,
  }),
  summarizeNotes: z.object({
    noteIds: z.array(idSchema).min(1).max(20),
  }),
  getMonthlyInsights: z.object({
    month: monthSchema,
  }),
} satisfies Record<AiToolName, z.ZodTypeAny>;

export const confirmAiToolCallInputSchema = z
  .object({
    approved: z.boolean(),
  })
  .strict();
export type ConfirmAiToolCallInput = z.infer<
  typeof confirmAiToolCallInputSchema
>;

export const aiStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), message: aiMessageSchema }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("tool_call"), toolCall: aiToolCallSchema }),
  z.object({ type: z.literal("done"), conversation: aiConversationDetailSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type AiStreamEvent = z.infer<typeof aiStreamEventSchema>;
