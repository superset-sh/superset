import { basename } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects } from "../db/schema";
import type { EventBus } from "../events";
import type { ProjectSnapshot, TagSettingSnapshot } from "../events/types";

export type HostProjectRow = typeof projects.$inferSelect;

export interface ProjectStoreContext {
	db: HostDb;
	eventBus: EventBus;
}

export function toProjectSnapshot(
	row: HostProjectRow,
	tagSettings?: TagSettingSnapshot[],
): ProjectSnapshot {
	return {
		id: row.id,
		// Rows that predate local ownership have an empty name until the
		// backfill sweep fills it; the folder name is the honest fallback.
		name: row.name || basename(row.repoPath) || row.id,
		repoPath: row.repoPath,
		repoOwner: row.repoOwner,
		repoName: row.repoName,
		repoUrl: row.repoUrl,
		worktreeBaseDir: row.worktreeBaseDir,
		icon: row.icon,
		color: row.color,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
		...(tagSettings !== undefined ? { tagSettings } : {}),
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
	tagSettings?: TagSettingSnapshot[],
): void {
	const deleted = eventType === "deleted";
	eventBus.broadcastProjectChanged({
		projectId: typeof rowOrId === "string" ? rowOrId : rowOrId.id,
		eventType,
		project:
			deleted || typeof rowOrId === "string"
				? null
				: toProjectSnapshot(rowOrId, tagSettings),
		occurredAt: Date.now(),
	});
}

export interface UpdateLocalProjectPatch {
	name?: string;
	icon?: string | null;
	color?: string | null;
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
