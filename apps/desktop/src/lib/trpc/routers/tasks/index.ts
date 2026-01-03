import { apiClient } from "main/lib/api-client";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const taskPriorityValues = ["urgent", "high", "medium", "low", "none"] as const;

const updateTaskSchema = z.object({
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

export const createTasksRouter = () => {
	return router({
		update: publicProcedure
			.input(updateTaskSchema)
			.mutation(async ({ input }) => {
				const result = await apiClient.task.update.mutate(input);
				return result;
			}),
	});
};
