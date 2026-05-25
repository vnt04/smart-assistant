import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

const titleSchema = z
  .string()
  .trim()
  .min(1, "Tiêu đề không được trống")
  .max(255);
const descriptionSchema = z.string().max(5000).nullable();
const locationSchema = z.string().max(255).nullable();

export const eventSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: descriptionSchema,
  startAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  allDay: z.boolean(),
  location: locationSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Event = z.infer<typeof eventSchema>;

export const eventListQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

export const createEventInputSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    startAt: isoDateTimeSchema,
    endAt: isoDateTimeSchema,
    allDay: z.boolean().optional(),
    location: locationSchema.optional(),
    remindAt: isoDateTimeSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => new Date(v.endAt) >= new Date(v.startAt), {
    message: "endAt phải sau hoặc bằng startAt",
    path: ["endAt"],
  });
export type CreateEventInput = z.infer<typeof createEventInputSchema>;

export const updateEventInputSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    startAt: isoDateTimeSchema.optional(),
    endAt: isoDateTimeSchema.optional(),
    allDay: z.boolean().optional(),
    location: locationSchema.optional(),
  })
  .strict()
  .refine(
    (v) => {
      if (!v.startAt || !v.endAt) return true;
      return new Date(v.endAt) >= new Date(v.startAt);
    },
    { message: "endAt phải sau hoặc bằng startAt", path: ["endAt"] },
  );
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;
