import { z } from "zod";
import { paginationMetaSchema } from "./common.js";

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    meta: paginationMetaSchema.optional(),
  });

export const apiFailureSchema = z.object({
  success: z.literal(false),
  error: apiErrorSchema,
});
export type ApiFailure = z.infer<typeof apiFailureSchema>;

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: z.infer<typeof paginationMetaSchema>;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const healthCheckSchema = z.object({
  status: z.literal("ok"),
  uptime: z.number(),
  timestamp: z.string().datetime(),
  version: z.string(),
});
export type HealthCheck = z.infer<typeof healthCheckSchema>;
