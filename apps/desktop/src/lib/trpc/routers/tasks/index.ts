import { apiClient } from "main/lib/api-client";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const updateTaskSchema = z.object({
	id: z.string().uuid(),
	title: z.string().min(1).optional(),
	description: z.string().nullable().optional(),
	status: z.string().optional(),
	priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
	assigneeId: z.string().uuid().nullable().optional(),
	estimate: z.number().nullable().optional(),
	dueDate: z.coerce.date().nullable().optional(),
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
