import { taskPriorityValues } from "@superset/db/enums";
import { z } from "zod";

export const createTaskSchema = z.object({
	slug: z.string().min(1),
	title: z.string().min(1),
	description: z.string().nullish(),
	statusId: z.string().uuid(),
	priority: z.enum(taskPriorityValues).default("none"),

	organizationId: z.string().uuid(),
	assigneeId: z.string().uuid().nullish(),
	branch: z.string().nullish(),
	estimate: z.number().int().positive().nullish(),
	dueDate: z.coerce.date().nullish(),
	labels: z.array(z.string()).nullish(),
});

export const updateTaskSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).optional(),
	description: z.string().nullish(),
	statusId: z.string().uuid().optional(),
	priority: z.enum(taskPriorityValues).optional(),

	assigneeId: z.string().uuid().nullish(),
	branch: z.string().nullish(),
	prUrl: z.string().url().nullish(),
	estimate: z.number().int().positive().nullish(),
	dueDate: z.coerce.date().nullish(),
	labels: z.array(z.string()).nullish(),
});

export const createTaskCommentSchema = z.object({
	taskId: z.string().uuid(),
	body: z.string().min(1),
});
