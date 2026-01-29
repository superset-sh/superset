import { db } from "@superset/db/client";
import { taskStatuses } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { registerTool } from "../../utils";

export const register = registerTool(
	"list_task_statuses",
	{
		description: "List available task statuses for the organization",
		inputSchema: {},
	},
	async (_params, ctx) => {
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
			content: [{ type: "text", text: JSON.stringify({ statuses }, null, 2) }],
		};
	},
);
