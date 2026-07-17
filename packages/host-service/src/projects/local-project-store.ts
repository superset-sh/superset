import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import type { ProjectSnapshot } from "../events/types";

export type HostProjectRow = typeof projects.$inferSelect;

export interface ProjectStoreContext {
	db: HostDb;
	eventBus: EventBus;
}

export function toProjectSnapshot(row: HostProjectRow): ProjectSnapshot {
	return {
		id: row.id,
		// Rows that predate local ownership have an empty name until the
		// backfill sweep fills it; the folder name is the honest fallback.
		name: row.name || row.repoPath.split("/").pop() || row.id,
		repoPath: row.repoPath,
		repoUrl: row.repoUrl,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
	};
}

export function getLocalProject(
	db: HostDb,
	id: string,
): HostProjectRow | undefined {
	return db.query.projects.findFirst({ where: eq(projects.id, id) }).sync();
}

export function emitProjectChanged(
	eventBus: EventBus,
	eventType: "created" | "updated" | "deleted",
	rowOrId: HostProjectRow | string,
): void {
	const deleted = eventType === "deleted";
	eventBus.broadcastProjectChanged({
		projectId: typeof rowOrId === "string" ? rowOrId : rowOrId.id,
		eventType,
		project:
			deleted || typeof rowOrId === "string"
				? null
				: toProjectSnapshot(rowOrId),
		occurredAt: Date.now(),
	});
}

export interface UpdateLocalProjectPatch {
	name?: string;
}

/** Patch a local project row, bump `updatedAt`, and broadcast. */
export function updateLocalProject(
	ctx: ProjectStoreContext,
	id: string,
	patch: UpdateLocalProjectPatch,
): HostProjectRow | undefined {
	const existing = getLocalProject(ctx.db, id);
	if (!existing) return undefined;
	ctx.db
		.update(projects)
		.set({ ...patch, updatedAt: Date.now() })
		.where(eq(projects.id, id))
		.run();
	const row = getLocalProject(ctx.db, id);
	if (!row) return undefined;
	emitProjectChanged(ctx.eventBus, "updated", row);
	return row;
}
