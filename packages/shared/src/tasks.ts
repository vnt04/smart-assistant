import { z } from "zod";
import { idSchema, isoDateTimeSchema } from "./common.js";

const titleSchema = z
  .string()
  .trim()
  .min(1, "Tiêu đề không được trống")
  .max(255);
const descriptionSchema = z.string().max(5000).nullable();

export const taskPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "urgent",
]);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const taskStatusSchema = z.enum(["todo", "doing", "done"]);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskSchema = z.object({
  id: idSchema,
  title: z.string(),
  description: descriptionSchema,
  priority: taskPrioritySchema,
  status: taskStatusSchema,
  deadline: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Task = z.infer<typeof taskSchema>;

export const taskListQuerySchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const createTaskInputSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema.optional(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
    deadline: isoDateTimeSchema.nullable().optional(),
    remindAt: isoDateTimeSchema.nullable().optional(),
  })
  .strict();
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const updateTaskInputSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
    deadline: isoDateTimeSchema.nullable().optional(),
  })
  .strict();
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;
