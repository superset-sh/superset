import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { deleteTasks, resolveTaskReference } from "@superset/trpc/tasks";
import { z } from "zod";
import { getMcpContext } from "../../utils";

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
			const resolvedTaskIds: string[] = [];

			for (const taskId of taskIds) {
				const task = await resolveTaskReference({
					organizationId: ctx.organizationId,
					taskRef: taskId,
				});

				if (!task) {
					return {
						content: [
							{ type: "text", text: `Error: Task not found: ${taskId}` },
						],
						isError: true,
					};
				}

				resolvedTaskIds.push(task.id);
			}

			const result = await deleteTasks({
				organizationId: ctx.organizationId,
				taskIds: resolvedTaskIds,
			});
			const data = { deleted: result.taskIds };

			return {
				structuredContent: data,
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
			};
		},
	);
}
