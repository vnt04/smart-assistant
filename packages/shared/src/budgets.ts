import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

const amountSchema = z
  .number()
  .int("Số tiền VND phải là số nguyên")
  .positive("Số tiền phải lớn hơn 0")
  .max(999_999_999_999_999);

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Định dạng tháng phải là YYYY-MM");

const thresholdSchema = z.number().int().min(1).max(100);

export const budgetSchema = z.object({
  id: idSchema,
  categoryId: idSchema,
  month: z.string(),
  amount: z.number().int(),
  alertThresholdPct: z.number().int(),
  alertedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Budget = z.infer<typeof budgetSchema>;

export const budgetStatusSchema = budgetSchema.extend({
  spent: z.number().int(),
  remaining: z.number().int(),
  percent: z.number(),
});
export type BudgetStatus = z.infer<typeof budgetStatusSchema>;

export const budgetListQuerySchema = z.object({
  month: monthSchema.optional(),
});
export type BudgetListQuery = z.infer<typeof budgetListQuerySchema>;

export const createBudgetInputSchema = z
  .object({
    categoryId: idSchema,
    month: monthSchema,
    amount: amountSchema,
    alertThresholdPct: thresholdSchema.optional(),
  })
  .strict();
export type CreateBudgetInput = z.infer<typeof createBudgetInputSchema>;

export const updateBudgetInputSchema = z
  .object({
    amount: amountSchema.optional(),
    alertThresholdPct: thresholdSchema.optional(),
  })
  .strict();
export type UpdateBudgetInput = z.infer<typeof updateBudgetInputSchema>;
