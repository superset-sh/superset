import { db, dbWs } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { registerTool } from "../../utils";

export const register = registerTool(
	"update_task",
	{
		description: "Update an existing task",
		inputSchema: {
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

		const updateData: Record<string, unknown> = {};
		if (params.title !== undefined) updateData.title = params.title;
		if (params.description !== undefined)
			updateData.description = params.description;
		if (params.priority !== undefined) updateData.priority = params.priority;
		if (params.assigneeId !== undefined)
			updateData.assigneeId = params.assigneeId;
		if (params.statusId !== undefined) updateData.statusId = params.statusId;
		if (params.labels !== undefined) updateData.labels = params.labels;
		if (params.dueDate !== undefined)
			updateData.dueDate = params.dueDate
				? new Date(params.dueDate as string)
				: null;
		if (params.estimate !== undefined) updateData.estimate = params.estimate;

		if (Object.keys(updateData).length === 0) {
			return {
				content: [
					{ type: "text", text: "Error: No updatable fields provided" },
				],
				isError: true,
			};
		}

		const result = await dbWs.transaction(async (tx) => {
			const [task] = await tx
				.update(tasks)
				.set(updateData)
				.where(eq(tasks.id, existingTask.id))
				.returning();

			const txid = await getCurrentTxid(tx);
			return { task, txid };
		});

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							id: result.task?.id,
							slug: result.task?.slug,
							title: result.task?.title,
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
