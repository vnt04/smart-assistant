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
  })
  .strict();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;
