import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

const colorHexSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Màu phải dạng #RRGGBB");

export const notebookSchema = z.object({
  id: idSchema,
  parentId: idSchema.nullable(),
  name: z.string().min(1).max(120),
  color: colorHexSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Notebook = z.infer<typeof notebookSchema>;

export const createNotebookInputSchema = z
  .object({
    parentId: idSchema.nullable().optional(),
    name: z.string().trim().min(1, "Vui lòng nhập tên notebook").max(120),
    color: colorHexSchema.nullable().optional(),
  })
  .strict();
export type CreateNotebookInput = z.infer<typeof createNotebookInputSchema>;

export const updateNotebookInputSchema = z
  .object({
    parentId: idSchema.nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    color: colorHexSchema.nullable().optional(),
  })
  .strict();
export type UpdateNotebookInput = z.infer<typeof updateNotebookInputSchema>;
