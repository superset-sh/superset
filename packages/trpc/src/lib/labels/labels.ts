import type { db, dbWs } from "@superset/db/client";
import { taskLabelAssignments, taskLabels } from "@superset/db/schema";
import { pickEntityColor } from "@superset/shared/entity-colors";
import { normalizeLabelName } from "@superset/shared/labels";
import { and, eq, inArray } from "drizzle-orm";

type Executor =
	| typeof db
	| Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

/** The organization's labels with these names, creating the ones it doesn't have yet. */
export async function ensureLabels(
	executor: Executor,
	organizationId: string,
	names: string[],
) {
	const normalized = [
		...new Set(
			names
				.map(normalizeLabelName)
				.filter((name): name is string => name !== null),
		),
	];
	if (normalized.length === 0) return [];
	await executor
		.insert(taskLabels)
		.values(
			normalized.map((name) => ({
				organizationId,
				name,
				color: pickEntityColor(),
			})),
		)
		.onConflictDoNothing();
	return executor
		.select({ id: taskLabels.id, name: taskLabels.name })
		.from(taskLabels)
		.where(
			and(
				eq(taskLabels.organizationId, organizationId),
				inArray(taskLabels.name, normalized),
			),
		);
}

export async function addTaskLabels(
	executor: Executor,
	taskId: string,
	labelIds: string[],
) {
	if (labelIds.length === 0) return [];
	const added = await executor
		.insert(taskLabelAssignments)
		.values(labelIds.map((labelId) => ({ taskId, labelId })))
		.onConflictDoNothing()
		.returning();
	return added.map((row) => row.labelId);
}

export async function removeTaskLabels(
	executor: Executor,
	taskId: string,
	labelIds: string[],
) {
	if (labelIds.length === 0) return [];
	const removed = await executor
		.delete(taskLabelAssignments)
		.where(
			and(
				eq(taskLabelAssignments.taskId, taskId),
				inArray(taskLabelAssignments.labelId, labelIds),
			),
		)
		.returning();
	return removed.map((row) => row.labelId);
}

/** Makes a task's labels exactly these names. */
export async function setTaskLabels(
	executor: Executor,
	args: { organizationId: string; taskId: string; names: string[] },
) {
	const labels = await ensureLabels(executor, args.organizationId, args.names);
	const current = await executor
		.select({ labelId: taskLabelAssignments.labelId })
		.from(taskLabelAssignments)
		.where(eq(taskLabelAssignments.taskId, args.taskId));
	const next = new Set(labels.map((label) => label.id));
	const previous = new Set(current.map((row) => row.labelId));
	return {
		added: await addTaskLabels(
			executor,
			args.taskId,
			[...next].filter((id) => !previous.has(id)),
		),
		removed: await removeTaskLabels(
			executor,
			args.taskId,
			[...previous].filter((id) => !next.has(id)),
		),
	};
}
