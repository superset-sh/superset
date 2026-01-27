import { db, dbWs } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { registerTool } from "../../utils";

export const register = registerTool(
	"delete_task",
	{
		description: "Soft delete a task",
		inputSchema: {
			taskId: z.string().describe("Task ID (uuid) or slug"),
		},
	},
	async (params, ctx) => {
		const taskId = params.taskId as string;
		const isUuid =
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				taskId,
			);

		const [existingTask] = await db
			.select()
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
				content: [{ type: "text", text: "Error: Task not found" }],
				isError: true,
			};
		}

		const deletedAt = new Date();
		const result = await dbWs.transaction(async (tx) => {
			await tx
				.update(tasks)
				.set({ deletedAt })
				.where(eq(tasks.id, existingTask.id));

			const txid = await getCurrentTxid(tx);
			return { txid };
		});

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							success: true,
							deletedAt: deletedAt.toISOString(),
							txid: result.txid,
						},
						null,
						2,
					),
				},
			],
		};
	},
);
