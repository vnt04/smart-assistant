import { z } from "zod";
import { idSchema } from "./common.js";

/** Max length of a vocab entry, measured after trim + whitespace-collapse. */
export const MAX_VOCAB_TEXT_LENGTH = 50;

/** Upper bound for a manually-entered review count (1 sighting per default). */
export const MAX_VOCAB_COUNT = 9999;

/** Stored vocab model returned to clients: { id, text, count, notes }. */
export const vocabItemSchema = z.object({
  id: idSchema,
  text: z.string(),
  count: z.number().int().nonnegative(),
  notes: z.string(),
});
export type VocabItem = z.infer<typeof vocabItemSchema>;

/**
 * Request body for POST /vocab. The extension sends only `text`; the manual
 * "add word" form may also send `count` (how many sightings to record at once).
 * When omitted, one sighting is recorded — the original extension behaviour.
 */
export const createVocabInputSchema = z.object({
  text: z.string(),
  count: z.number().int().positive().max(MAX_VOCAB_COUNT).optional(),
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
  "invalid_count",
  "not_found",
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
