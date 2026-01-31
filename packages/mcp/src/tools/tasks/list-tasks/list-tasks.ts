import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { taskStatuses, tasks, users } from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getMcpContext } from "../../utils";

type TaskStatusType =
	| "backlog"
	| "unstarted"
	| "started"
	| "completed"
	| "canceled";

const PRIORITIES = ["urgent", "high", "medium", "low", "none"] as const;
type TaskPriority = (typeof PRIORITIES)[number];

function isPriority(value: unknown): value is TaskPriority {
	return PRIORITIES.includes(value as TaskPriority);
}

export function register(server: McpServer) {
	server.registerTool(
		"list_tasks",
		{
			description: "List tasks with optional filters",
			inputSchema: {
				statusId: z.string().uuid().optional().describe("Filter by status ID"),
				statusType: z
					.enum(["backlog", "unstarted", "started", "completed", "canceled"])
					.optional()
					.describe("Filter by status type"),
				assigneeId: z.string().uuid().optional().describe("Filter by assignee"),
				assignedToMe: z
					.boolean()
					.optional()
					.describe("Filter to tasks assigned to current user"),
				creatorId: z.string().uuid().optional().describe("Filter by creator"),
				createdByMe: z
					.boolean()
					.optional()
					.describe("Filter to tasks created by current user"),
				priority: z
					.enum(["urgent", "high", "medium", "low", "none"])
					.optional(),
				labels: z
					.array(z.string())
					.optional()
					.describe("Filter by labels (tasks must have ALL specified labels)"),
				search: z.string().optional().describe("Search in title/description"),
				includeDeleted: z
					.boolean()
					.optional()
					.describe("Include deleted tasks in results"),
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.number().int().min(0).default(0),
			},
			outputSchema: {
				tasks: z.array(
					z.object({
						id: z.string(),
						slug: z.string(),
						title: z.string(),
						description: z.string().nullable(),
						priority: z.string(),
						statusId: z.string().nullable(),
						statusName: z.string().nullable(),
						statusType: z.string().nullable(),
						assigneeId: z.string().nullable(),
						assigneeName: z.string().nullable(),
						creatorId: z.string().nullable(),
						creatorName: z.string().nullable(),
						labels: z.array(z.string()),
						dueDate: z.string().nullable(),
						estimate: z.number().nullable(),
						deletedAt: z.string().nullable(),
					}),
				),
				count: z.number(),
				hasMore: z.boolean(),
			},
		},
		async (args, extra) => {
			const ctx = getMcpContext(extra);
			const statusId = args.statusId as string | undefined;
			const statusType = args.statusType as TaskStatusType | undefined;
			const assigneeId = args.assigneeId as string | undefined;
			const assignedToMe = args.assignedToMe as boolean | undefined;
			const creatorId = args.creatorId as string | undefined;
			const createdByMe = args.createdByMe as boolean | undefined;
			const priority = args.priority;
			const labels = args.labels as string[] | undefined;
			const search = args.search as string | undefined;
			const includeDeleted = args.includeDeleted as boolean | undefined;
			const limit = args.limit as number;
			const offset = args.offset as number;

			const assignee = alias(users, "assignee");
			const creator = alias(users, "creator");
			const status = alias(taskStatuses, "status");

			const conditions: SQL<unknown>[] = [
				eq(tasks.organizationId, ctx.organizationId),
			];

			if (!includeDeleted) {
				conditions.push(isNull(tasks.deletedAt));
			}

			if (statusId) {
				conditions.push(eq(tasks.statusId, statusId));
			}

			if (assigneeId) {
				conditions.push(eq(tasks.assigneeId, assigneeId));
			} else if (assignedToMe) {
				conditions.push(eq(tasks.assigneeId, ctx.userId));
			}

			if (creatorId) {
				conditions.push(eq(tasks.creatorId, creatorId));
			} else if (createdByMe) {
				conditions.push(eq(tasks.creatorId, ctx.userId));
			}

			if (isPriority(priority)) {
				conditions.push(eq(tasks.priority, priority));
			}

			if (labels && labels.length > 0) {
				conditions.push(
					sql`${tasks.labels} @> ${JSON.stringify(labels)}::jsonb`,
				);
			}

			if (search) {
				const searchCondition = or(
					ilike(tasks.title, `%${search}%`),
					ilike(tasks.description, `%${search}%`),
				);
				if (searchCondition) {
					conditions.push(searchCondition);
				}
			}

			if (statusType) {
				const statusesOfType = await db
					.select({ id: taskStatuses.id })
					.from(taskStatuses)
					.where(
						and(
							eq(taskStatuses.organizationId, ctx.organizationId),
							eq(taskStatuses.type, statusType),
						),
					);
				const statusIds = statusesOfType.map((s) => s.id);
				if (statusIds.length > 0) {
					const statusCondition = or(
						...statusIds.map((id) => eq(tasks.statusId, id)),
					);
					if (statusCondition) {
						conditions.push(statusCondition);
					}
				} else {
					const data = { tasks: [], count: 0, hasMore: false };
					return {
						structuredContent: data,
						content: [
							{
								type: "text",
								text: JSON.stringify(data, null, 2),
							},
						],
					};
				}
			}

			const tasksList = await db
				.select({
					id: tasks.id,
					slug: tasks.slug,
					title: tasks.title,
					description: tasks.description,
					priority: tasks.priority,
					statusId: tasks.statusId,
					statusName: status.name,
					statusType: status.type,
					assigneeId: tasks.assigneeId,
					assigneeName: assignee.name,
					creatorId: tasks.creatorId,
					creatorName: creator.name,
					labels: tasks.labels,
					dueDate: tasks.dueDate,
					estimate: tasks.estimate,
					deletedAt: tasks.deletedAt,
				})
				.from(tasks)
				.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
				.leftJoin(creator, eq(tasks.creatorId, creator.id))
				.leftJoin(status, eq(tasks.statusId, status.id))
				.where(and(...conditions))
				.orderBy(desc(tasks.createdAt))
				.limit(limit)
				.offset(offset);

			const data = {
				tasks: tasksList.map((t) => ({
					...t,
					dueDate: t.dueDate?.toISOString() ?? null,
					deletedAt: t.deletedAt?.toISOString() ?? null,
				})),
				count: tasksList.length,
				hasMore: tasksList.length === limit,
			};
			return {
				structuredContent: data,
				content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
			};
		},
	);
}
