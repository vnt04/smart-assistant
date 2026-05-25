import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const reminderTargetTypeSchema = z.enum(["event", "task"]);
export type ReminderTargetType = z.infer<typeof reminderTargetTypeSchema>;

export const reminderSchema = z.object({
  id: idSchema,
  targetType: reminderTargetTypeSchema,
  targetId: idSchema,
  remindAt: isoDateTimeSchema,
  sentAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type Reminder = z.infer<typeof reminderSchema>;

export const createReminderInputSchema = z
  .object({
    targetType: reminderTargetTypeSchema,
    targetId: idSchema,
    remindAt: isoDateTimeSchema,
  })
  .strict();
export type CreateReminderInput = z.infer<typeof createReminderInputSchema>;

export const telegramTestSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type TelegramTestResponse = z.infer<typeof telegramTestSchema>;
