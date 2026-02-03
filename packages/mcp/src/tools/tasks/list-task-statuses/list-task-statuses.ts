import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"list_task_statuses",
		{
			description: "List available task statuses for the organization",
			inputSchema: {},
			outputSchema: {
				statuses: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						color: z.string(),
						type: z.string(),
						position: z.number(),
					}),
				),
			},
		},
		async (_args, extra) => {
			const ctx = getMcpContext(extra);

			const statuses = await db
				.select({
					id: taskStatuses.id,
					name: taskStatuses.name,
					color: taskStatuses.color,
					type: taskStatuses.type,
					position: taskStatuses.position,
				})
				.from(taskStatuses)
				.where(eq(taskStatuses.organizationId, ctx.organizationId))
				.orderBy(taskStatuses.position);

			return {
				structuredContent: { statuses },
				content: [
					{ type: "text", text: JSON.stringify({ statuses }, null, 2) },
				],
			};
		},
	);
}
