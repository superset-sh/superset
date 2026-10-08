import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	getTableColumns,
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
import {
	type IntegrationProvider,
	type TaskPriority,
	taskPriorityValues,
} from "./schema/enums";
import { escapeLikePattern } from "./utils/like";

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

/** Written out because drizzle leaves columns unqualified in a single-table select, where a bare "id" would bind to task_labels. */
export const taskLabelNames = sql<
	string[]
>`coalesce((select jsonb_agg(label.name order by label.name) from task_label_assignments assignment join task_labels label on label.id = assignment.label_id where assignment.task_id = "tasks"."id"), '[]'::jsonb)`;

const { legacyLabels: _legacyLabels, ...taskTableColumns } =
	getTableColumns(tasks);

/** Columns the Linear mirror had. Released clients still read these keys, so a task carries them as nulls. */
export const retiredTaskColumns = {
	externalProvider: sql<IntegrationProvider | null>`null`,
	externalId: sql<string | null>`null`,
	externalKey: sql<string | null>`null`,
	externalUrl: sql<string | null>`null`,
	lastSyncedAt: sql<Date | null>`null`,
	syncError: sql<string | null>`null`,
	externalUpdatedAt: sql<Date | null>`null`,
	externalProjectId: sql<string | null>`null`,
	externalProjectName: sql<string | null>`null`,
	externalCycleId: sql<string | null>`null`,
	externalCycleName: sql<string | null>`null`,
	assigneeExternalId: sql<string | null>`null`,
	assigneeDisplayName: sql<string | null>`null`,
	assigneeAvatarUrl: sql<string | null>`null`,
};

/** A task's columns with its label names, for selecting whole tasks. */
export const taskColumns = {
	...taskTableColumns,
	...retiredTaskColumns,
	labels: taskLabelNames,
};

/**
 * Sort by this rather than the column: with an org filter and a LIMIT, Postgres otherwise walks the
 * global created_at index through every organization's tasks (99s for a 93k-task org on 7M rows).
 */
export const taskCreatedAtSortKey = sql`${tasks.createdAt} + interval '0 seconds'`;

export interface TaskListFilters {
	organizationId: string;
	includeDeleted?: boolean;
	nativeOnly?: boolean;
	teamId?: string;
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

export function buildTaskListConditions(
	filters: TaskListFilters,
): SQL<unknown>[] {
	const conditions: SQL<unknown>[] = [
		eq(tasks.organizationId, filters.organizationId),
	];

	if (!filters.includeDeleted) {
		conditions.push(isNull(tasks.deletedAt));
	}

	if (filters.nativeOnly) {
		const nativeStatuses = new QueryBuilder()
			.select({ id: taskStatuses.id })
			.from(taskStatuses)
			.where(
				and(
					eq(taskStatuses.organizationId, filters.organizationId),
					isNull(taskStatuses.externalProvider),
				),
			);
		conditions.push(inArray(tasks.statusId, nativeStatuses));
	}

	if (filters.teamId) {
		conditions.push(eq(tasks.teamId, filters.teamId));
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

	for (const name of filters.labels ?? []) {
		conditions.push(
			sql`exists (select 1 from task_label_assignments assignment join task_labels label on label.id = assignment.label_id where assignment.task_id = "tasks"."id" and label.name = ${name.trim().toLowerCase()})`,
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

	if (
		filters.externalProjectId ||
		filters.externalProjectName ||
		filters.externalCycleId
	) {
		conditions.push(sql`false`);
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
				return dir(taskCreatedAtSortKey);
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
