import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dbWs } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";
import { formatMcpResponse, resolveTaskId } from "../utils";

export function register(server: McpServer) {
	server.registerTool(
		"delete_task",
		{
			description: "Soft delete one or more tasks",
			inputSchema: {
				taskIds: z
					.array(z.string())
					.min(1)
					.max(25)
					.describe("Task IDs (uuid or slug) to delete (1-25)"),
			},
			outputSchema: {
				deleted: z.array(z.string()),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const taskIds = args.taskIds as string[];

			const resolvedTasks: { id: string; identifier: string }[] = [];

			for (const taskId of taskIds) {
				const existingTask = await resolveTaskId({
					taskId,
					organizationId: ctx.organizationId,
				});

				if (!existingTask) {
					return {
						content: [
							{ type: "text", text: `Error: Task not found: ${taskId}` },
						],
						isError: true,
					};
				}

				resolvedTasks.push({ id: existingTask.id, identifier: taskId });
			}

			const taskIdsToDelete = resolvedTasks.map((t) => t.id);
			const deletedAt = new Date();

			await dbWs
				.update(tasks)
				.set({ deletedAt })
				.where(inArray(tasks.id, taskIdsToDelete));

			return formatMcpResponse({ deleted: taskIdsToDelete });
		},
	);
}
