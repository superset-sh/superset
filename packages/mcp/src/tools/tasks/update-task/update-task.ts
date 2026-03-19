import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveTaskReference, updateTasks } from "@superset/trpc/tasks";
import { z } from "zod";
import { getMcpContext } from "../../utils";

const updateSchema = z.object({
	taskId: z.string().describe("Task ID (uuid) or slug"),
	title: z.string().min(1).optional().describe("New title"),
	description: z.string().optional().describe("New description"),
	priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
	assigneeId: z
		.string()
		.uuid()
		.nullable()
		.optional()
		.describe("New assignee (null to unassign)"),
	statusId: z.string().uuid().optional().describe("New status ID"),
	labels: z.array(z.string()).optional().describe("Replace labels"),
	dueDate: z
		.string()
		.datetime()
		.nullable()
		.optional()
		.describe("New due date (null to clear)"),
	estimate: z.number().int().positive().nullable().optional(),
});

type UpdateInput = z.infer<typeof updateSchema>;

export function register(server: McpServer) {
	server.registerTool(
		"update_task",
		{
			description: "Update one or more existing tasks",
			inputSchema: {
				updates: z
					.array(updateSchema)
					.min(1)
					.max(25)
					.describe("Array of task updates (1-25)"),
			},
			outputSchema: {
				updated: z.array(
					z.object({
						id: z.string(),
						slug: z.string(),
						title: z.string(),
					}),
				),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const updates = args.updates as UpdateInput[];
			const resolvedUpdates: UpdateInput[] = [];

			for (const [index, update] of updates.entries()) {
				const task = await resolveTaskReference({
					organizationId: ctx.organizationId,
					taskRef: update.taskId,
				});

				if (!task) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Task not found: ${update.taskId} (index ${index})`,
							},
						],
						isError: true,
					};
				}

				const hasUpdates =
					update.title !== undefined ||
					update.description !== undefined ||
					update.priority !== undefined ||
					update.assigneeId !== undefined ||
					update.statusId !== undefined ||
					update.labels !== undefined ||
					update.dueDate !== undefined ||
					update.estimate !== undefined;
				if (!hasUpdates) {
					return {
						content: [
							{
								type: "text",
								text: `Error: No updatable fields provided for task: ${update.taskId} (index ${index})`,
							},
						],
						isError: true,
					};
				}

				resolvedUpdates.push({
					...update,
					taskId: task.id,
				});
			}

			const result = await updateTasks({
				organizationId: ctx.organizationId,
				inputs: resolvedUpdates.map(({ taskId, ...input }) => ({
					id: taskId,
					title: input.title,
					description: input.description,
					priority: input.priority,
					assigneeId: input.assigneeId,
					statusId: input.statusId,
					labels: input.labels,
					dueDate:
						input.dueDate === undefined
							? undefined
							: input.dueDate
								? new Date(input.dueDate)
								: null,
					estimate: input.estimate,
				})),
			});

			const data = {
				updated: result.tasks.map((task) => ({
					id: task.id,
					slug: task.slug,
					title: task.title,
				})),
			};

			return {
				structuredContent: data,
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
			};
		},
	);
}
