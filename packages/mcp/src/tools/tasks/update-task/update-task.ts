import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db, dbWs } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
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

			const resolvedUpdates: {
				taskId: string;
				updateData: Record<string, unknown>;
			}[] = [];

			for (const [i, update] of updates.entries()) {
				const taskId = update.taskId;
				const isUuid = z.string().uuid().safeParse(taskId).success;

				const [existingTask] = await db
					.select({ id: tasks.id })
					.from(tasks)
					.where(
						and(
							isUuid ? eq(tasks.id, taskId) : eq(tasks.slug, taskId),
							eq(tasks.organizationId, ctx.organizationId),
							isNull(tasks.deletedAt),
						),
					)
					.limit(1);

				if (!existingTask) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Task not found: ${taskId} (index ${i})`,
							},
						],
						isError: true,
					};
				}

				const updateData: Record<string, unknown> = {};
				if (update.title !== undefined) updateData.title = update.title;
				if (update.description !== undefined)
					updateData.description = update.description;
				if (update.priority !== undefined)
					updateData.priority = update.priority;
				if (update.assigneeId !== undefined)
					updateData.assigneeId = update.assigneeId;
				if (update.statusId !== undefined)
					updateData.statusId = update.statusId;
				if (update.labels !== undefined) updateData.labels = update.labels;
				if (update.dueDate !== undefined)
					updateData.dueDate = update.dueDate ? new Date(update.dueDate) : null;
				if (update.estimate !== undefined)
					updateData.estimate = update.estimate;

				if (Object.keys(updateData).length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `Error: No updatable fields provided for task: ${taskId} (index ${i})`,
							},
						],
						isError: true,
					};
				}

				resolvedUpdates.push({ taskId: existingTask.id, updateData });
			}

			const updatedTasks: { id: string; slug: string; title: string }[] = [];

			for (const { taskId, updateData } of resolvedUpdates) {
				const [task] = await dbWs
					.update(tasks)
					.set(updateData)
					.where(eq(tasks.id, taskId))
					.returning({
						id: tasks.id,
						slug: tasks.slug,
						title: tasks.title,
					});

				if (task) {
					updatedTasks.push(task);
				}
			}

			const data = { updated: updatedTasks };
			return {
				structuredContent: data,
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
			};
		},
	);
}
