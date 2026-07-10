import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@superset/db/client";
import { type TaskPriority, taskPriorityValues } from "@superset/db/enums";
import { taskStatuses, tasks, users } from "@superset/db/schema";
import {
	buildTaskListConditions,
	buildTaskListOrderBy,
	InvalidDueDateRangeError,
	normalizeDueDateRange,
	type TaskListSortBy,
	type TaskListSortOrder,
	type TaskStatusType,
	taskListSortByValues,
	taskListSortOrderValues,
	taskStatusTypeValues,
} from "@superset/db/task-list-query";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getMcpContext } from "../../utils";

function isPriority(value: unknown): value is TaskPriority {
	return (taskPriorityValues as readonly string[]).includes(value as string);
}

export function register(server: McpServer) {
	server.registerTool(
		"list_tasks",
		{
			description: "List tasks with optional filters",
			inputSchema: {
				statusId: z.string().uuid().optional().describe("Filter by status ID"),
				statusType: z
					.enum(taskStatusTypeValues)
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
				priority: z.enum(taskPriorityValues).optional(),
				labels: z
					.array(z.string())
					.optional()
					.describe("Filter by labels (tasks must have ALL specified labels)"),
				search: z.string().optional().describe("Search in title/description"),
				externalProjectId: z
					.string()
					.optional()
					.describe("Filter by Linear project ID"),
				externalProjectName: z
					.string()
					.optional()
					.describe("Filter by Linear project name (prefix, case-insensitive)"),
				externalCycleId: z
					.string()
					.optional()
					.describe("Filter by Linear cycle ID"),
				dueDateFrom: z
					.string()
					.datetime({ offset: true })
					.optional()
					.describe(
						"Tasks due on or after this date (ISO datetime, normalized to UTC day start)",
					),
				dueDateTo: z
					.string()
					.datetime({ offset: true })
					.optional()
					.describe(
						"Tasks due on or before this date (ISO datetime, normalized to UTC day end)",
					),
				sortBy: z
					.enum(taskListSortByValues)
					.optional()
					.describe("Sort field (default: createdAt)"),
				sortOrder: z
					.enum(taskListSortOrderValues)
					.optional()
					.describe("Sort direction (default: desc)"),
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
						assigneeExternalId: z.string().nullable(),
						assigneeDisplayName: z.string().nullable(),
						assigneeAvatarUrl: z.string().nullable(),
						creatorId: z.string().nullable(),
						creatorName: z.string().nullable(),
						labels: z.array(z.string()),
						dueDate: z.string().nullable(),
						estimate: z.number().nullable(),
						externalProjectId: z.string().nullable(),
						externalProjectName: z.string().nullable(),
						externalCycleId: z.string().nullable(),
						externalCycleName: z.string().nullable(),
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
			const externalProjectId = args.externalProjectId as string | undefined;
			const externalProjectName = args.externalProjectName as
				| string
				| undefined;
			const externalCycleId = args.externalCycleId as string | undefined;
			const dueDateFrom = args.dueDateFrom as string | undefined;
			const dueDateTo = args.dueDateTo as string | undefined;
			const sortBy = args.sortBy as TaskListSortBy | undefined;
			const sortOrder = args.sortOrder as TaskListSortOrder | undefined;
			const includeDeleted = args.includeDeleted as boolean | undefined;
			const limit = args.limit as number;
			const offset = args.offset as number;

			let dueDateRange: { from?: Date; to?: Date };
			try {
				dueDateRange = normalizeDueDateRange(dueDateFrom, dueDateTo);
			} catch (error) {
				if (error instanceof InvalidDueDateRangeError) {
					return {
						content: [{ type: "text", text: `Error: ${error.message}` }],
						isError: true,
					};
				}
				throw error;
			}

			const assignee = alias(users, "assignee");
			const creator = alias(users, "creator");
			const status = alias(taskStatuses, "status");

			const conditions = buildTaskListConditions({
				organizationId: ctx.organizationId,
				includeDeleted,
				statusId,
				statusType,
				assigneeId: assigneeId ?? (assignedToMe ? ctx.userId : undefined),
				creatorId: creatorId ?? (createdByMe ? ctx.userId : undefined),
				priority: isPriority(priority) ? priority : undefined,
				labels,
				search,
				externalProjectId,
				externalProjectName,
				externalCycleId,
				dueDateFrom: dueDateRange.from,
				dueDateTo: dueDateRange.to,
			});

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
					assigneeName: sql<
						string | null
					>`coalesce(${assignee.name}, ${tasks.assigneeDisplayName})`,
					assigneeExternalId: tasks.assigneeExternalId,
					assigneeDisplayName: tasks.assigneeDisplayName,
					assigneeAvatarUrl: tasks.assigneeAvatarUrl,
					creatorId: tasks.creatorId,
					creatorName: creator.name,
					labels: tasks.labels,
					dueDate: tasks.dueDate,
					estimate: tasks.estimate,
					externalProjectId: tasks.externalProjectId,
					externalProjectName: tasks.externalProjectName,
					externalCycleId: tasks.externalCycleId,
					externalCycleName: tasks.externalCycleName,
					deletedAt: tasks.deletedAt,
				})
				.from(tasks)
				.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
				.leftJoin(creator, eq(tasks.creatorId, creator.id))
				.leftJoin(status, eq(tasks.statusId, status.id))
				.where(and(...conditions))
				.orderBy(...buildTaskListOrderBy(sortBy, sortOrder))
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
