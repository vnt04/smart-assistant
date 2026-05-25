import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Tag không được để trống")
  .max(64, "Tag tối đa 64 ký tự");

export const tagSchema = z.object({
  id: idSchema,
  name: tagNameSchema,
  createdAt: isoDateTimeSchema,
});
export type Tag = z.infer<typeof tagSchema>;

export const createTagInputSchema = z
  .object({
    name: tagNameSchema,
  })
  .strict();
export type CreateTagInput = z.infer<typeof createTagInputSchema>;
