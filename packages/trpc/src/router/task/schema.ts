import { taskPriorityValues } from "@superset/db/enums";
import { z } from "zod";

export const createTaskSchema = z.object({
	slug: z.string().min(1),
	title: z.string().min(1),
	description: z.string().optional(),
	status: z.string().min(1).default("Backlog"),
	priority: z.enum(taskPriorityValues).default("none"),
	repositoryId: z.string().uuid().optional(),
	organizationId: z.string().uuid(),
	assigneeId: z.string().uuid().optional(),
	branch: z.string().optional(),
	estimate: z.number().int().positive().optional(),
	dueDate: z.coerce.date().optional(),
	labels: z.array(z.string()).optional(),
});

export const updateTaskSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).optional(),
	description: z.string().nullable().optional(),
	status: z.string().optional(),
	priority: z.enum(taskPriorityValues).optional(),
	repositoryId: z.string().uuid().optional(),
	assigneeId: z.string().uuid().nullable().optional(),
	branch: z.string().nullable().optional(),
	prUrl: z.string().url().nullable().optional(),
	estimate: z.number().int().positive().nullable().optional(),
	dueDate: z.coerce.date().nullable().optional(),
	labels: z.array(z.string()).optional(),
});
