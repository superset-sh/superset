import { db } from "@superset/db/client";
import { taskStatuses, tasks, users } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { registerTool } from "../../utils";

export const register = registerTool(
	"get_task",
	{
		description: "Get a single task by ID or slug",
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

		const assignee = alias(users, "assignee");
		const creator = alias(users, "creator");
		const status = alias(taskStatuses, "status");

		const [task] = await db
			.select({
				id: tasks.id,
				slug: tasks.slug,
				title: tasks.title,
				description: tasks.description,
				priority: tasks.priority,
				statusId: tasks.statusId,
				statusName: status.name,
				statusType: status.type,
				statusColor: status.color,
				assigneeId: tasks.assigneeId,
				assigneeName: assignee.name,
				assigneeEmail: assignee.email,
				creatorId: tasks.creatorId,
				creatorName: creator.name,
				labels: tasks.labels,
				dueDate: tasks.dueDate,
				estimate: tasks.estimate,
				branch: tasks.branch,
				prUrl: tasks.prUrl,
				createdAt: tasks.createdAt,
				updatedAt: tasks.updatedAt,
			})
			.from(tasks)
			.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
			.leftJoin(creator, eq(tasks.creatorId, creator.id))
			.leftJoin(status, eq(tasks.statusId, status.id))
			.where(
				and(
					isUuid ? eq(tasks.id, taskId) : eq(tasks.slug, taskId),
					eq(tasks.organizationId, ctx.organizationId),
					isNull(tasks.deletedAt),
				),
			)
			.limit(1);

		if (!task) {
			return {
				content: [{ type: "text", text: "Error: Task not found" }],
				isError: true,
			};
		}

		return {
			content: [{ type: "text", text: JSON.stringify(task, null, 2) }],
		};
	},
);
