import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

export const reportGranularitySchema = z.enum(["day", "week", "month"]);
export type ReportGranularity = z.infer<typeof reportGranularitySchema>;

export const expenseByCategoryQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
});
export type ExpenseByCategoryQuery = z.infer<
  typeof expenseByCategoryQuerySchema
>;

export const expenseByCategoryItemSchema = z.object({
  categoryId: idSchema.nullable(),
  categoryName: z.string(),
  color: z.string().nullable(),
  total: z.number().int(),
});
export type ExpenseByCategoryItem = z.infer<
  typeof expenseByCategoryItemSchema
>;

export const expenseByCategoryResponseSchema = z.object({
  total: z.number().int(),
  items: z.array(expenseByCategoryItemSchema),
});
export type ExpenseByCategoryResponse = z.infer<
  typeof expenseByCategoryResponseSchema
>;

export const trendQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
  granularity: reportGranularitySchema.default("day"),
});
export type TrendQuery = z.infer<typeof trendQuerySchema>;

export const trendBucketSchema = z.object({
  bucket: z.string(),
  expense: z.number().int(),
  income: z.number().int(),
});
export type TrendBucket = z.infer<typeof trendBucketSchema>;

export const trendResponseSchema = z.object({
  buckets: z.array(trendBucketSchema),
});
export type TrendResponse = z.infer<typeof trendResponseSchema>;

export const exportQuerySchema = z.object({
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
