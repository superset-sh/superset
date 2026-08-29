import { basename } from "node:path";
import { normalizeWorkspaceTag } from "@superset/shared/workspace-tags";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, workspaceTagSettings } from "../db/schema";
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

/** A project's tag-folder presentation rows, sorted by tag. */
export function getProjectTagSettings(
	db: HostDb,
	projectId: string,
): TagSettingSnapshot[] {
	return db
		.select({
			tag: workspaceTagSettings.tag,
			displayName: workspaceTagSettings.displayName,
			color: workspaceTagSettings.color,
			tabOrder: workspaceTagSettings.tabOrder,
		})
		.from(workspaceTagSettings)
		.where(eq(workspaceTagSettings.projectId, projectId))
		.all()
		.sort((left, right) => left.tag.localeCompare(right.tag));
}

export interface UpsertTagSettingPatch {
	displayName?: string | null;
	color?: string | null;
	tabOrder?: number | null;
}

/**
 * Merge-upsert one folder's presentation and broadcast the project so every
 * device re-renders. Absent patch fields keep their stored value; a row is
 * created on first customisation (never up front). Making the label a row
 * here is what turns rename into ONE update — the tag stays the stable slug
 * agents target.
 */
export function upsertTagSetting(
	ctx: ProjectStoreContext,
	projectId: string,
	rawTag: string,
	patch: UpsertTagSettingPatch,
): TagSettingSnapshot[] | undefined {
	const tag = normalizeWorkspaceTag(rawTag);
	if (tag == null) return undefined;
	const project = getLocalProject(ctx.db, projectId);
	if (!project) return undefined;
	const where = and(
		eq(workspaceTagSettings.projectId, projectId),
		eq(workspaceTagSettings.tag, tag),
	);
	const existing = ctx.db
		.select()
		.from(workspaceTagSettings)
		.where(where)
		.all()[0];
	if (existing) {
		ctx.db
			.update(workspaceTagSettings)
			.set({
				displayName:
					patch.displayName !== undefined
						? patch.displayName
						: existing.displayName,
				color: patch.color !== undefined ? patch.color : existing.color,
				tabOrder:
					patch.tabOrder !== undefined ? patch.tabOrder : existing.tabOrder,
				updatedAt: Date.now(),
			})
			.where(where)
			.run();
	} else {
		ctx.db
			.insert(workspaceTagSettings)
			.values({
				projectId,
				tag,
				displayName: patch.displayName ?? null,
				color: patch.color ?? null,
				tabOrder: patch.tabOrder ?? null,
			})
			.run();
	}
	const settings = getProjectTagSettings(ctx.db, projectId);
	emitProjectChanged(ctx.eventBus, "updated", project, settings);
	return settings;
}

/** Remove one folder's presentation row (folder deletion). Idempotent. */
export function deleteTagSetting(
	ctx: ProjectStoreContext,
	projectId: string,
	rawTag: string,
): TagSettingSnapshot[] | undefined {
	const tag = normalizeWorkspaceTag(rawTag);
	if (tag == null) return undefined;
	const project = getLocalProject(ctx.db, projectId);
	if (!project) return undefined;
	ctx.db
		.delete(workspaceTagSettings)
		.where(
			and(
				eq(workspaceTagSettings.projectId, projectId),
				eq(workspaceTagSettings.tag, tag),
			),
		)
		.run();
	const settings = getProjectTagSettings(ctx.db, projectId);
	emitProjectChanged(ctx.eventBus, "updated", project, settings);
	return settings;
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
	emitProjectChanged(
		ctx.eventBus,
		"updated",
		row,
		getProjectTagSettings(ctx.db, id),
	);
	return row;
}
