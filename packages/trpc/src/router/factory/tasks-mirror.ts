import { db, dbWs } from "@superset/db/client";
import {
	type FactoryStage,
	factories,
	factoryItems,
	type SelectFactoryItem,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";
import { syncTask } from "../../lib/integrations/sync";
import { createTaskForOrg } from "../task/task";

/**
 * Mirrors factory items into the Tasks flow (and therefore Linear):
 * entering implement creates a started task; done/rejected completes or
 * cancels it. Best-effort — a mirror failure must never fail the report
 * or transition that triggered it.
 */
export async function mirrorStageToTask(
	itemId: string,
	stage: FactoryStage,
): Promise<void> {
	if (stage !== "implement" && stage !== "done" && stage !== "rejected") {
		return;
	}
	try {
		const [item] = await db
			.select()
			.from(factoryItems)
			.where(eq(factoryItems.id, itemId))
			.limit(1);
		if (!item) return;

		if (stage === "implement") {
			await createMirrorTask(item);
		} else if (item.taskId) {
			await closeMirrorTask(item.taskId, item.organizationId, stage);
		}
	} catch (err) {
		console.error("[factory/tasks-mirror] mirror failed:", err);
	}
}

async function createMirrorTask(item: SelectFactoryItem): Promise<void> {
	if (item.taskId) return;
	const [factory] = await db
		.select()
		.from(factories)
		.where(eq(factories.id, item.factoryId))
		.limit(1);
	if (!factory) return;

	const { task } = await createTaskForOrg(
		factory.organizationId,
		factory.ownerUserId,
		{
			title: `#${item.externalNumber} ${item.title}`,
			description: `Factory item for ${item.externalUrl} — implementation in progress.`,
			priority: "none",
			labels: ["factory"],
		},
	);
	if (!task) return;

	// taskId is claimed CAS-style so a double report can't create twins.
	const [claimed] = await dbWs
		.update(factoryItems)
		.set({ taskId: task.id })
		.where(and(eq(factoryItems.id, item.id), isNull(factoryItems.taskId)))
		.returning({ id: factoryItems.id });
	if (!claimed) return;

	const started = await statusOfType(item.organizationId, "started");
	if (started) {
		await dbWs
			.update(tasks)
			.set({ statusId: started, startedAt: new Date() })
			.where(eq(tasks.id, task.id));
		void syncTask(task.id);
	}
}

async function closeMirrorTask(
	taskId: string,
	organizationId: string,
	stage: "done" | "rejected",
): Promise<void> {
	const target = await statusOfType(
		organizationId,
		stage === "done" ? "completed" : "canceled",
	);
	if (!target) return;
	await dbWs
		.update(tasks)
		.set({
			statusId: target,
			...(stage === "done" ? { completedAt: new Date() } : {}),
		})
		.where(eq(tasks.id, taskId));
	void syncTask(taskId);
}

async function statusOfType(
	organizationId: string,
	type: "started" | "completed" | "canceled",
): Promise<string | null> {
	const [row] = await db
		.select({ id: taskStatuses.id })
		.from(taskStatuses)
		.where(
			and(
				eq(taskStatuses.organizationId, organizationId),
				eq(taskStatuses.type, type),
			),
		)
		.orderBy(asc(taskStatuses.position))
		.limit(1);
	return row?.id ?? null;
}
