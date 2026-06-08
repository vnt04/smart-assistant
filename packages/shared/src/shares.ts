import { z } from "zod";
import { emailSchema } from "./auth.js";
import { idSchema, isoDateTimeSchema } from "./common.js";

// Loại resource có thể chia sẻ.
export const shareResourceTypeSchema = z.enum(["note", "notebook"]);
export type ShareResourceType = z.infer<typeof shareResourceTypeSchema>;

// Mức truy cập qua link công khai: tắt ("none") hoặc ai có link đều xem ("view").
export const shareLinkAccessSchema = z.enum(["none", "view"]);
export type ShareLinkAccess = z.infer<typeof shareLinkAccessSchema>;

// Một người được mời xem (theo email). Người này phải đăng nhập đúng email mới
// xem được khi link công khai đang tắt.
export const shareInviteSchema = z.object({
  id: idSchema,
  email: emailSchema,
  createdAt: isoDateTimeSchema,
});
export type ShareInvite = z.infer<typeof shareInviteSchema>;

// Cấu hình chia sẻ của một resource — chỉ trả cho CHỦ SỞ HỮU.
export const shareSchema = z.object({
  id: idSchema,
  resourceType: shareResourceTypeSchema,
  resourceId: idSchema,
  linkAccess: shareLinkAccessSchema,
  // Token đưa vào URL /share/:token. Luôn tồn tại nhưng chỉ có tác dụng khi
  // linkAccess = "view" hoặc người xem nằm trong danh sách invites.
  token: z.string(),
  invites: z.array(shareInviteSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Share = z.infer<typeof shareSchema>;

// ---- Inputs (chủ sở hữu) ----

export const updateShareLinkInputSchema = z
  .object({ linkAccess: shareLinkAccessSchema })
  .strict();
export type UpdateShareLinkInput = z.infer<typeof updateShareLinkInputSchema>;

export const addShareInviteInputSchema = z
  .object({ email: emailSchema })
  .strict();
export type AddShareInviteInput = z.infer<typeof addShareInviteInputSchema>;

// ---- Payload CÔNG KHAI cho người nhận (read-only) ----
// Tuyệt đối không lộ userId, email/credential của chủ, hay storedPath của file.

// Nội dung 1 note hiển thị ở trang share.
export const sharedNoteViewSchema = z.object({
  id: idSchema,
  title: z.string(),
  contentHtml: z.string(),
  updatedAt: isoDateTimeSchema,
});
export type SharedNoteView = z.infer<typeof sharedNoteViewSchema>;

// Note tóm tắt khi duyệt một notebook được share.
export const sharedNoteSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  excerpt: z.string(),
  updatedAt: isoDateTimeSchema,
});
export type SharedNoteSummary = z.infer<typeof sharedNoteSummarySchema>;

// Kết quả resolve token khi share 1 note.
export const sharedNotePayloadSchema = z.object({
  resourceType: z.literal("note"),
  ownerName: z.string(),
  note: sharedNoteViewSchema,
});
export type SharedNotePayload = z.infer<typeof sharedNotePayloadSchema>;

// Kết quả resolve token khi share 1 notebook (kèm danh sách note bên trong).
export const sharedNotebookPayloadSchema = z.object({
  resourceType: z.literal("notebook"),
  ownerName: z.string(),
  notebook: z.object({
    id: idSchema,
    name: z.string(),
  }),
  notes: z.array(sharedNoteSummarySchema),
});
export type SharedNotebookPayload = z.infer<typeof sharedNotebookPayloadSchema>;

// Resolve token → hoặc 1 note, hoặc 1 notebook + danh sách note.
export const sharedResourceSchema = z.discriminatedUnion("resourceType", [
  sharedNotePayloadSchema,
  sharedNotebookPayloadSchema,
]);
export type SharedResource = z.infer<typeof sharedResourceSchema>;
