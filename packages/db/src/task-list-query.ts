import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNull,
	lte,
	or,
	sql,
} from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { taskStatuses, tasks } from "./schema";
import { type TaskPriority, taskPriorityValues } from "./schema/enums";

export const taskStatusTypeValues = [
	"backlog",
	"unstarted",
	"started",
	"completed",
	"canceled",
] as const;
export type TaskStatusType = (typeof taskStatusTypeValues)[number];

export const taskListSortByValues = [
	"createdAt",
	"updatedAt",
	"dueDate",
	"priority",
] as const;
export type TaskListSortBy = (typeof taskListSortByValues)[number];

export const taskListSortOrderValues = ["asc", "desc"] as const;
export type TaskListSortOrder = (typeof taskListSortOrderValues)[number];

export interface TaskListFilters {
	organizationId: string;
	includeDeleted?: boolean;
	statusId?: string;
	statusType?: TaskStatusType;
	assigneeId?: string;
	creatorId?: string;
	priority?: TaskPriority;
	labels?: string[];
	search?: string;
	externalProjectId?: string;
	externalProjectName?: string;
	externalCycleId?: string;
	dueDateFrom?: Date;
	dueDateTo?: Date;
}

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildTaskListConditions(
	filters: TaskListFilters,
): SQL<unknown>[] {
	const conditions: SQL<unknown>[] = [
		eq(tasks.organizationId, filters.organizationId),
	];

	if (!filters.includeDeleted) {
		conditions.push(isNull(tasks.deletedAt));
	}

	if (filters.statusId) {
		conditions.push(eq(tasks.statusId, filters.statusId));
	}

	if (filters.statusType) {
		const statusesOfType = new QueryBuilder()
			.select({ id: taskStatuses.id })
			.from(taskStatuses)
			.where(
				and(
					eq(taskStatuses.organizationId, filters.organizationId),
					eq(taskStatuses.type, filters.statusType),
				),
			);
		conditions.push(inArray(tasks.statusId, statusesOfType));
	}

	if (filters.assigneeId) {
		conditions.push(eq(tasks.assigneeId, filters.assigneeId));
	}

	if (filters.creatorId) {
		conditions.push(eq(tasks.creatorId, filters.creatorId));
	}

	if (filters.priority) {
		conditions.push(eq(tasks.priority, filters.priority));
	}

	if (filters.labels && filters.labels.length > 0) {
		conditions.push(
			sql`${tasks.labels} @> ${JSON.stringify(filters.labels)}::jsonb`,
		);
	}

	if (filters.search) {
		const pattern = `%${escapeLikePattern(filters.search)}%`;
		const searchCondition = or(
			ilike(tasks.title, pattern),
			ilike(tasks.description, pattern),
		);
		if (searchCondition) {
			conditions.push(searchCondition);
		}
	}

	if (filters.externalProjectId) {
		conditions.push(eq(tasks.externalProjectId, filters.externalProjectId));
	}

	if (filters.externalProjectName) {
		conditions.push(
			ilike(
				tasks.externalProjectName,
				`${escapeLikePattern(filters.externalProjectName)}%`,
			),
		);
	}

	if (filters.externalCycleId) {
		conditions.push(eq(tasks.externalCycleId, filters.externalCycleId));
	}

	if (filters.dueDateFrom) {
		conditions.push(gte(tasks.dueDate, filters.dueDateFrom));
	}

	if (filters.dueDateTo) {
		conditions.push(lte(tasks.dueDate, filters.dueDateTo));
	}

	return conditions;
}

function priorityRank(): SQL<number> {
	// Highest priority gets the highest rank so `desc` puts urgent first.
	const whens = taskPriorityValues.map(
		(value, index) =>
			sql`WHEN ${value} THEN ${taskPriorityValues.length - 1 - index}`,
	);
	return sql<number>`CASE ${tasks.priority} ${sql.join(whens, sql` `)} END`;
}

export function buildTaskListOrderBy(
	sortBy: TaskListSortBy = "createdAt",
	sortOrder: TaskListSortOrder = "desc",
): SQL<unknown>[] {
	const dir = sortOrder === "asc" ? asc : desc;
	const primary = (() => {
		switch (sortBy) {
			case "updatedAt":
				return dir(tasks.updatedAt);
			case "dueDate":
				return sortOrder === "asc"
					? sql`${tasks.dueDate} ASC NULLS LAST`
					: sql`${tasks.dueDate} DESC NULLS LAST`;
			case "priority":
				return dir(priorityRank());
			default:
				return dir(tasks.createdAt);
		}
	})();
	return [primary, asc(tasks.id)];
}

export class InvalidDueDateRangeError extends Error {
	constructor() {
		super("dueDateFrom must be before or equal to dueDateTo");
		this.name = "InvalidDueDateRangeError";
	}
}

/**
 * Normalizes ISO datetime bounds to whole UTC days: `from` becomes the start
 * of its day, `to` the end of its day. Throws when the range is inverted.
 */
export function normalizeDueDateRange(
	from?: string,
	to?: string,
): { from?: Date; to?: Date } {
	const toDay = (value: string) => new Date(value).toISOString().slice(0, 10);
	if (from && to && toDay(from) > toDay(to)) {
		throw new InvalidDueDateRangeError();
	}
	return {
		from: from ? new Date(`${toDay(from)}T00:00:00.000Z`) : undefined,
		to: to ? new Date(`${toDay(to)}T23:59:59.999Z`) : undefined,
	};
}
