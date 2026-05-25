import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const walletTypeSchema = z.enum([
  "cash",
  "bank",
  "e_wallet",
  "credit_card",
]);
export type WalletType = z.infer<typeof walletTypeSchema>;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Tên ví không được trống")
  .max(120);
const colorHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const iconSchema = z.string().trim().min(1).max(64);

export const walletSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: walletTypeSchema,
  balance: z.number().int(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  archived: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Wallet = z.infer<typeof walletSchema>;

export const createWalletInputSchema = z
  .object({
    name: nameSchema,
    type: walletTypeSchema,
    balance: z.number().int().optional(),
    icon: iconSchema.nullable().optional(),
    color: colorHexSchema.nullable().optional(),
  })
  .strict();
export type CreateWalletInput = z.infer<typeof createWalletInputSchema>;

export const updateWalletInputSchema = z
  .object({
    name: nameSchema.optional(),
    type: walletTypeSchema.optional(),
    icon: iconSchema.nullable().optional(),
    color: colorHexSchema.nullable().optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export type UpdateWalletInput = z.infer<typeof updateWalletInputSchema>;
