import { z } from "zod";

export const aiProviderSchema = z.enum(["claude", "openai", "ollama"]);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;

export const userSettingsSchema = z.object({
  aiProvider: aiProviderSchema,
  aiApiKeyMasked: z.string().nullable(),
  telegramBotTokenMasked: z.string().nullable(),
  telegramChatId: z.string().nullable(),
  theme: themeSchema,
  defaultWalletId: z.string().uuid().nullable(),
  // Đã đặt mật khẩu khóa ghi chú hay chưa. KHÔNG bao giờ lộ hash mật khẩu.
  hasNotesLock: z.boolean(),
  // Cấu hình n8n cho "Quản lý Workflow Exc" ở view Jobs. Base URL không nhạy cảm
  // nên trả thẳng; API key (X-N8N-API-KEY) chỉ trả dạng masked.
  n8nBaseUrl: z.string().nullable(),
  n8nApiKeyMasked: z.string().nullable(),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;

export const updateSettingsInputSchema = z
  .object({
    aiProvider: aiProviderSchema.optional(),
    aiApiKey: z.string().min(1).max(500).nullable().optional(),
    telegramBotToken: z
      .string()
      .regex(/^\d+:[A-Za-z0-9_-]+$/, "Telegram bot token không hợp lệ")
      .nullable()
      .optional(),
    telegramChatId: z.string().min(1).max(64).nullable().optional(),
    theme: themeSchema.optional(),
    defaultWalletId: z.string().uuid().nullable().optional(),
    // n8n: base URL (http/https) + API key công khai (header X-N8N-API-KEY).
    n8nBaseUrl: z.string().url("Base URL n8n không hợp lệ").max(512).nullable().optional(),
    n8nApiKey: z.string().min(1).max(2048).nullable().optional(),
  })
  .strict();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

const notesLockPasswordSchema = z
  .string()
  .min(4, "Mật khẩu khóa tối thiểu 4 ký tự")
  .max(128, "Mật khẩu khóa tối đa 128 ký tự");

// Đặt mới (lần đầu, không cần currentPassword) hoặc đổi (cần currentPassword đúng).
export const setNotesLockInputSchema = z
  .object({
    currentPassword: z.string().min(1).optional(),
    newPassword: notesLockPasswordSchema,
  })
  .strict();
export type SetNotesLockInput = z.infer<typeof setNotesLockInputSchema>;

// Dùng chung cho: reveal note / unlock note / unlock notebook / xóa mật khẩu khóa.
export const verifyNotesLockInputSchema = z
  .object({
    password: z.string().min(1, "Vui lòng nhập mật khẩu"),
  })
  .strict();
export type VerifyNotesLockInput = z.infer<typeof verifyNotesLockInputSchema>;
