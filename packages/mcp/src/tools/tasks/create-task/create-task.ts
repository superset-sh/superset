import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTasks } from "@superset/trpc/tasks";
import { z } from "zod";
import { getMcpContext } from "../../utils";

const taskInputSchema = z.object({
	title: z.string().min(1).describe("Task title"),
	description: z.string().optional().describe("Task description (markdown)"),
	priority: z
		.enum(["urgent", "high", "medium", "low", "none"])
		.default("none")
		.describe("Task priority"),
	assigneeId: z.string().uuid().optional().describe("User ID to assign to"),
	statusId: z
		.string()
		.uuid()
		.optional()
		.describe("Status ID (defaults to backlog)"),
	labels: z.array(z.string()).optional().describe("Array of label strings"),
	dueDate: z.string().datetime().optional().describe("Due date in ISO format"),
	estimate: z
		.number()
		.int()
		.positive()
		.optional()
		.describe("Estimate in points/hours"),
});

type TaskInput = z.infer<typeof taskInputSchema>;

export function register(server: McpServer) {
	server.registerTool(
		"create_task",
		{
			description: "Create one or more tasks in the organization",
			inputSchema: {
				tasks: z
					.array(taskInputSchema)
					.min(1)
					.max(25)
					.describe("Array of tasks to create (1-25)"),
			},
			outputSchema: {
				created: z.array(
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
			const taskInputs = args.tasks as TaskInput[];

			const result = await createTasks({
				organizationId: ctx.organizationId,
				creatorId: ctx.userId,
				inputs: taskInputs.map((input) => ({
					title: input.title,
					description: input.description ?? null,
					priority: input.priority ?? "none",
					assigneeId: input.assigneeId ?? null,
					statusId: input.statusId,
					labels: input.labels ?? [],
					dueDate: input.dueDate ? new Date(input.dueDate) : null,
					estimate: input.estimate ?? null,
				})),
			});

			const createdTasks = result.tasks.map((task) => ({
				id: task.id,
				slug: task.slug,
				title: task.title,
			}));

			return {
				structuredContent: { created: createdTasks },
				content: [
					{
						type: "text",
						text: JSON.stringify({ created: createdTasks }, null, 2),
					},
				],
			};
		},
	);
}
