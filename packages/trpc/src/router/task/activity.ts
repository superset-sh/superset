import type { db, dbWs } from "@superset/db/client";
import {
	type InsertTaskActivity,
	type SelectTask,
	taskActivity,
} from "@superset/db/schema";

type Executor =
	| typeof db
	| Parameters<Parameters<typeof dbWs.transaction>[0]>[0];

export type TaskActor = { kind: "user"; userId: string } | { kind: "system" };

type TaskChange = Omit<
	InsertTaskActivity,
	"id" | "taskId" | "actorKind" | "actorUserId" | "createdAt"
>;

type TrackedFields = Pick<
	SelectTask,
	"title" | "description" | "statusId" | "priority" | "assigneeId"
>;

/** One change per field that moved, so each reads as its own timeline entry. */
export function diffTaskActivity(
	before: TrackedFields,
	after: TrackedFields,
): TaskChange[] {
	const changes: TaskChange[] = [];
	if (before.title !== after.title) {
		changes.push({ fromTitle: before.title, toTitle: after.title });
	}
	if ((before.description ?? "") !== (after.description ?? "")) {
		changes.push({ descriptionEdited: true });
	}
	if (before.statusId !== after.statusId) {
		changes.push({ fromStatusId: before.statusId, toStatusId: after.statusId });
	}
	if (before.priority !== after.priority) {
		changes.push({ fromPriority: before.priority, toPriority: after.priority });
	}
	if (before.assigneeId !== after.assigneeId) {
		changes.push({
			fromAssigneeId: before.assigneeId,
			toAssigneeId: after.assigneeId,
		});
	}
	return changes;
}

export function labelActivity(
	changes: { added: string[]; removed: string[] } | null,
): TaskChange[] {
	if (!changes) return [];
	return [
		...(changes.added.length > 0 ? [{ addedLabelIds: changes.added }] : []),
		...(changes.removed.length > 0
			? [{ removedLabelIds: changes.removed }]
			: []),
	];
}

export async function recordTaskActivity(
	executor: Executor,
	taskId: string,
	actor: TaskActor,
	changes: TaskChange[],
) {
	if (changes.length === 0) return;
	await executor.insert(taskActivity).values(
		changes.map((change) => ({
			taskId,
			actorKind: actor.kind,
			actorUserId: actor.kind === "user" ? actor.userId : null,
			...change,
		})),
	);
}
