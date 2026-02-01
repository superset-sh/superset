import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses, tasks, users } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getMcpContext } from "../../utils";

export function register(server: McpServer) {
	server.registerTool(
		"get_task",
		{
			description: "Get a single task by ID or slug",
			inputSchema: {
				taskId: z.string().describe("Task ID (uuid) or slug"),
			},
			outputSchema: {
				task: z.object({
					id: z.string(),
					slug: z.string(),
					title: z.string(),
					description: z.string().nullable(),
					priority: z.string(),
					statusId: z.string().nullable(),
					statusName: z.string().nullable(),
					statusType: z.string().nullable(),
					statusColor: z.string().nullable(),
					assigneeId: z.string().nullable(),
					assigneeName: z.string().nullable(),
					assigneeEmail: z.string().nullable(),
					creatorId: z.string().nullable(),
					creatorName: z.string().nullable(),
					labels: z.array(z.string()),
					dueDate: z.string().nullable(),
					estimate: z.number().nullable(),
					branch: z.string().nullable(),
					prUrl: z.string().nullable(),
				}),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const taskId = args.taskId as string;
			const isUuid = z.string().uuid().safeParse(taskId).success;

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

			const serializedTask = {
				...task,
				dueDate: task.dueDate?.toISOString() ?? null,
			};
			return {
				structuredContent: { task: serializedTask },
				content: [
					{
						type: "text",
						text: JSON.stringify({ task: serializedTask }, null, 2),
					},
				],
			};
		},
	);
}
