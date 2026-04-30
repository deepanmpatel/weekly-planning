import { z } from "zod";

export const statusEnum = z.enum([
  "todo",
  "in_progress",
  "waiting_for_reply",
  "done",
]);

export const projectCreate = z.object({
  name: z.string().min(1).max(120),
});

export const projectUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  position: z.number().int().optional(),
});

export const estimatedTimeUnitEnum = z.enum(["hours", "days"]);

export const taskCreate = z.object({
  project_id: z.string().uuid(),
  parent_task_id: z.string().uuid().nullish(),
  name: z.string().min(1).max(400),
  description: z.string().optional(),
  status: statusEnum.optional(),
  due_date: z.string().date().nullish(),
  position: z.number().int().optional(),
  assignee_id: z.string().uuid().nullish(),
  estimated_time: z.number().nonnegative().nullish(),
  estimated_time_unit: estimatedTimeUnitEnum.optional(),
});

export const taskUpdate = z.object({
  name: z.string().min(1).max(400).optional(),
  description: z.string().optional(),
  status: statusEnum.optional(),
  due_date: z.string().date().nullish(),
  project_id: z.string().uuid().optional(),
  parent_task_id: z.string().uuid().nullish(),
  position: z.number().int().optional(),
  assignee_id: z.string().uuid().nullish(),
  is_today: z.boolean().optional(),
  estimated_time: z.number().nonnegative().nullish(),
  estimated_time_unit: estimatedTimeUnitEnum.optional(),
});

export const commentCreate = z.object({
  body: z.string().min(1).max(4000),
});

export const tagCreate = z.object({
  name: z.string().min(1).max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const tagAttach = z.object({
  tag_id: z.string().uuid(),
});
