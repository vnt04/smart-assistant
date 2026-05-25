import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const categoryKindSchema = z.enum(["expense", "income"]);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

const nameSchema = z
  .string()
  .trim()
  .min(1, "Tên danh mục không được trống")
  .max(120);
const colorHexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const iconSchema = z.string().trim().min(1).max(64);

export const categorySchema = z.object({
  id: idSchema,
  parentId: idSchema.nullable(),
  name: z.string(),
  kind: categoryKindSchema,
  icon: z.string().nullable(),
  color: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = z
  .object({
    parentId: idSchema.nullable().optional(),
    name: nameSchema,
    kind: categoryKindSchema,
    icon: iconSchema.nullable().optional(),
    color: colorHexSchema.nullable().optional(),
  })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = z
  .object({
    parentId: idSchema.nullable().optional(),
    name: nameSchema.optional(),
    icon: iconSchema.nullable().optional(),
    color: colorHexSchema.nullable().optional(),
  })
  .strict();
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
