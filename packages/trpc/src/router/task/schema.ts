import { taskPriorityValues } from "@superset/db/enums";
import { z } from "zod";

export const createTaskSchema = z.object({
	title: z.string().min(1),
	description: z.string().nullish(),
	statusId: z.string().uuid().nullish(),
	priority: z.enum(taskPriorityValues).default("none"),
	assigneeId: z.string().uuid().nullish(),
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
	prUrl: z.string().url().nullish(),
	estimate: z.number().int().positive().nullish(),
	dueDate: z.coerce.date().nullish(),
	labels: z.array(z.string()).nullish(),
	// Deprecated: accepted-but-ignored. Drop in CLI-vNext cleanup PR.
	branch: z.string().nullish(),
});

export const taskListInputSchema = z
	.object({
		statusId: z.string().uuid().nullish(),
		priority: z.enum(taskPriorityValues).nullish(),
		assigneeId: z.string().uuid().nullish(),
		assigneeMe: z.boolean().nullish(),
		creatorMe: z.boolean().nullish(),
		search: z.string().min(1).nullish(),
		limit: z.number().int().positive().max(500).default(50),
		offset: z.number().int().nonnegative().default(0),
	})
	.nullish();
