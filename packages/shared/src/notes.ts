import { z } from "zod";
import { idSchema, isoDateTimeSchema, paginationMetaSchema } from "./common.js";
import { tagNameSchema, tagSchema } from "./tags.js";

export const attachmentSchema = z.object({
  id: idSchema,
  noteId: idSchema,
  originalName: z.string().min(1).max(255),
  mime: z.string().min(1).max(127),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
});
export type Attachment = z.infer<typeof attachmentSchema>;

const titleSchema = z.string().trim().min(1, "Tiêu đề không được trống").max(255);
const contentHtmlSchema = z.string().max(2_000_000);

export const noteSummarySchema = z.object({
  id: idSchema,
  notebookId: idSchema.nullable(),
  title: z.string(),
  excerpt: z.string(),
  isPinned: z.boolean(),
  // Cờ khóa RIÊNG của note (không phải effective). Frontend tự tính khóa hiệu
  // lực từ cây notebook; server enforce độc lập (ẩn excerpt/strip content).
  isLocked: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  tags: z.array(tagSchema),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

export const noteSchema = z.object({
  id: idSchema,
  notebookId: idSchema.nullable(),
  title: z.string(),
  contentHtml: z.string(),
  contentText: z.string(),
  isPinned: z.boolean(),
  isLocked: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  tags: z.array(tagSchema),
  attachments: z.array(attachmentSchema),
});
export type Note = z.infer<typeof noteSchema>;

export const noteListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  notebookId: z.union([idSchema, z.literal("none")]).optional(),
  includeChildren: z.coerce.boolean().optional(),
  tag: tagNameSchema.optional(),
  pinned: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});
export type NoteListQuery = z.infer<typeof noteListQuerySchema>;

export const noteListResponseSchema = z.object({
  items: z.array(noteSummarySchema),
  meta: paginationMetaSchema,
});
export type NoteListResponse = z.infer<typeof noteListResponseSchema>;

export const createNoteInputSchema = z
  .object({
    notebookId: idSchema.nullable().optional(),
    title: titleSchema,
    contentHtml: contentHtmlSchema.optional().default(""),
    tags: z.array(tagNameSchema).max(20).optional(),
    isPinned: z.boolean().optional(),
  })
  .strict();
export type CreateNoteInput = z.infer<typeof createNoteInputSchema>;

export const updateNoteInputSchema = z
  .object({
    notebookId: idSchema.nullable().optional(),
    title: titleSchema.optional(),
    contentHtml: contentHtmlSchema.optional(),
    tags: z.array(tagNameSchema).max(20).optional(),
    isPinned: z.boolean().optional(),
  })
  .strict();
export type UpdateNoteInput = z.infer<typeof updateNoteInputSchema>;
