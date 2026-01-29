import { db, dbWs } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { registerTool } from "../../utils";

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const register = registerTool(
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
	},
	async (params, ctx) => {
		const taskIds = params.taskIds as string[];

		// Resolve all taskIds to actual tasks
		const resolvedTasks: { id: string; identifier: string }[] = [];

		for (const taskId of taskIds) {
			const isUuid = UUID_REGEX.test(taskId);

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
							text: JSON.stringify(
								{
									error: `Task not found: ${taskId}`,
									failedAt: { index: resolvedTasks.length, taskId },
								},
								null,
								2,
							),
						},
					],
					isError: true,
				};
			}

			resolvedTasks.push({ id: existingTask.id, identifier: taskId });
		}

		const taskIdsToDelete = resolvedTasks.map((t) => t.id);
		const deletedAt = new Date();

		const result = await dbWs.transaction(async (tx) => {
			await tx
				.update(tasks)
				.set({ deletedAt })
				.where(inArray(tasks.id, taskIdsToDelete));

			const txid = await getCurrentTxid(tx);
			return { txid };
		});

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							deleted: taskIdsToDelete,
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
