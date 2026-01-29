import { db } from "@superset/db/client";
import { taskStatuses, tasks, users } from "@superset/db/schema";
import type { SQL } from "drizzle-orm";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { registerTool } from "../../utils";

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

export const register = registerTool(
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
			priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
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
	},
	async (params, ctx) => {
		const statusId = params.statusId as string | undefined;
		const statusType = params.statusType as TaskStatusType | undefined;
		const assigneeId = params.assigneeId as string | undefined;
		const assignedToMe = params.assignedToMe as boolean | undefined;
		const creatorId = params.creatorId as string | undefined;
		const createdByMe = params.createdByMe as boolean | undefined;
		const priority = params.priority;
		const labels = params.labels as string[] | undefined;
		const search = params.search as string | undefined;
		const includeDeleted = params.includeDeleted as boolean | undefined;
		const limit = params.limit as number;
		const offset = params.offset as number;

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
			// JSONB containment: tasks.labels must contain ALL specified labels
			conditions.push(sql`${tasks.labels} @> ${JSON.stringify(labels)}::jsonb`);
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
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ tasks: [], count: 0, hasMore: false },
								null,
								2,
							),
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
				createdAt: tasks.createdAt,
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

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(
						{
							tasks: tasksList,
							count: tasksList.length,
							hasMore: tasksList.length === limit,
						},
						null,
						2,
					),
				},
			],
		};
	},
);
