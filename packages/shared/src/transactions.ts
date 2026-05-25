import { z } from "zod";
import { idSchema, isoDateTimeSchema, paginationMetaSchema } from "./common.js";

export const transactionKindSchema = z.enum(["expense", "income", "transfer"]);
export type TransactionKind = z.infer<typeof transactionKindSchema>;

const amountSchema = z
  .number({ invalid_type_error: "Số tiền không hợp lệ" })
  .int("Số tiền VND phải là số nguyên")
  .positive("Số tiền phải lớn hơn 0")
  .max(999_999_999_999_999);

const noteSchema = z.string().max(500).nullable();

export const transactionSchema = z.object({
  id: idSchema,
  kind: transactionKindSchema,
  amount: z.number().int(),
  walletId: idSchema,
  transferToWalletId: idSchema.nullable(),
  categoryId: idSchema.nullable(),
  occurredAt: isoDateTimeSchema,
  note: noteSchema,
  createdAt: isoDateTimeSchema,
});
export type Transaction = z.infer<typeof transactionSchema>;

export const transactionListQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  walletId: idSchema.optional(),
  categoryId: idSchema.optional(),
  kind: transactionKindSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export const transactionListResponseSchema = z.object({
  items: z.array(transactionSchema),
  meta: paginationMetaSchema,
});
export type TransactionListResponse = z.infer<
  typeof transactionListResponseSchema
>;

export const createTransactionInputSchema = z
  .object({
    kind: transactionKindSchema,
    amount: amountSchema,
    walletId: idSchema,
    transferToWalletId: idSchema.nullable().optional(),
    categoryId: idSchema.nullable().optional(),
    occurredAt: isoDateTimeSchema.optional(),
    note: noteSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === "transfer") {
      if (!v.transferToWalletId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferToWalletId"],
          message: "Chuyển khoản phải có ví đích",
        });
      }
      if (v.transferToWalletId && v.transferToWalletId === v.walletId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferToWalletId"],
          message: "Ví đích phải khác ví nguồn",
        });
      }
    } else if (v.transferToWalletId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transferToWalletId"],
        message: "Chỉ transfer mới có transferToWalletId",
      });
    }
  });
export type CreateTransactionInput = z.infer<
  typeof createTransactionInputSchema
>;

export const updateTransactionInputSchema = z
  .object({
    amount: amountSchema.optional(),
    categoryId: idSchema.nullable().optional(),
    occurredAt: isoDateTimeSchema.optional(),
    note: noteSchema.optional(),
  })
  .strict();
export type UpdateTransactionInput = z.infer<
  typeof updateTransactionInputSchema
>;
