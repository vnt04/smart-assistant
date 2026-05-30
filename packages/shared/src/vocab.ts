import { z } from "zod";
import { idSchema } from "./common.js";

/** Max length of a vocab entry, measured after trim + whitespace-collapse. */
export const MAX_VOCAB_TEXT_LENGTH = 50;

/** Stored vocab model returned to clients: { id, text, count, notes }. */
export const vocabItemSchema = z.object({
  id: idSchema,
  text: z.string(),
  count: z.number().int().nonnegative(),
  notes: z.string(),
});
export type VocabItem = z.infer<typeof vocabItemSchema>;

/** Request body for POST /vocab — the extension sends only `text`. */
export const createVocabInputSchema = z.object({
  text: z.string(),
});
export type CreateVocabInput = z.infer<typeof createVocabInputSchema>;

/** Success envelope for POST /vocab. */
export const trackVocabResponseSchema = z.object({
  status: z.enum(["created", "incremented"]),
  item: vocabItemSchema,
});
export type TrackVocabResponse = z.infer<typeof trackVocabResponseSchema>;

/** Stable reason codes the extension can branch on. */
export const vocabErrorReasonSchema = z.enum([
  "empty",
  "too_long",
  "unauthorized",
  "server_error",
]);
export type VocabErrorReason = z.infer<typeof vocabErrorReasonSchema>;

/** Error envelope: { status: "error", reason }. */
export const vocabErrorResponseSchema = z.object({
  status: z.literal("error"),
  reason: vocabErrorReasonSchema,
});
export type VocabErrorResponse = z.infer<typeof vocabErrorResponseSchema>;

/** Response for GET /vocab — a plain list of stored items. */
export const vocabListResponseSchema = z.array(vocabItemSchema);
export type VocabListResponse = z.infer<typeof vocabListResponseSchema>;
