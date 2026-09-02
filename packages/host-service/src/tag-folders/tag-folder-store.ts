import {
	normalizeWorkspaceTag,
	SESSIONS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, tagFolderSettings } from "../db/schema";
import type { EventBus } from "../events";
import type {
	TagFolderSettingSnapshot,
	TagSettingSnapshot,
} from "../events/types";

export interface TagFolderStoreContext {
	db: HostDb;
	eventBus: EventBus;
}

export interface UpsertTagSettingPatch {
	displayName?: string | null;
	color?: string | null;
	tabOrder?: number | null;
}

/** Sessions is virtual; every other accepted scope must be a local project. */
export function hasTagFolderScope(db: HostDb, scope: string): boolean {
	if (scope === SESSIONS_TAG_SCOPE) return true;
	return (
		db
			.select({ id: projects.id })
			.from(projects)
			.where(eq(projects.id, scope))
			.all()[0] !== undefined
	);
}

/**
 * Every folder presentation row on this host, across all scopes. The table
 * holds one row per *customised* folder, so this stays small — the renderer
 * fans it out per host rather than plumbing per-host scope lists.
 */
export function getAllTagFolderSettings(
	db: HostDb,
): TagFolderSettingSnapshot[] {
	return db
		.select({
			scope: tagFolderSettings.scope,
			tag: tagFolderSettings.tag,
			displayName: tagFolderSettings.displayName,
			color: tagFolderSettings.color,
			tabOrder: tagFolderSettings.tabOrder,
		})
		.from(tagFolderSettings)
		.all()
		.sort(
			(left, right) =>
				left.scope.localeCompare(right.scope) ||
				left.tag.localeCompare(right.tag),
		);
}

/** One scope's folder presentation rows, sorted by tag. */
export function getTagFolderSettings(
	db: HostDb,
	scope: string,
): TagSettingSnapshot[] {
	return db
		.select({
			tag: tagFolderSettings.tag,
			displayName: tagFolderSettings.displayName,
			color: tagFolderSettings.color,
			tabOrder: tagFolderSettings.tabOrder,
		})
		.from(tagFolderSettings)
		.where(eq(tagFolderSettings.scope, scope))
		.all()
		.sort((left, right) => left.tag.localeCompare(right.tag));
}

function broadcast(
	ctx: TagFolderStoreContext,
	scope: string,
): TagSettingSnapshot[] {
	const settings = getTagFolderSettings(ctx.db, scope);
	ctx.eventBus.broadcastTagFoldersChanged({
		scope,
		settings: settings.map((setting) => ({
			...setting,
			scope,
		})),
		occurredAt: Date.now(),
	});
	return settings;
}

/**
 * Merge-upsert one folder's presentation and broadcast the scope to connected
 * renderers. Absent patch fields keep their stored value; a row is created on
 * first customisation (never up front). Making the label a row here is what
 * turns rename into ONE update — the tag stays the stable slug agents target.
 *
 * The router validates that project scopes exist before calling this store;
 * the Sessions lane is the one valid scope with no project behind it.
 */
export function upsertTagFolderSetting(
	ctx: TagFolderStoreContext,
	scope: string,
	rawTag: string,
	patch: UpsertTagSettingPatch,
): TagSettingSnapshot[] | undefined {
	const tag = normalizeWorkspaceTag(rawTag);
	if (tag == null) return undefined;
	const where = and(
		eq(tagFolderSettings.scope, scope),
		eq(tagFolderSettings.tag, tag),
	);
	const existing = ctx.db
		.select()
		.from(tagFolderSettings)
		.where(where)
		.all()[0];
	if (existing) {
		ctx.db
			.update(tagFolderSettings)
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
			.insert(tagFolderSettings)
			.values({
				scope,
				tag,
				displayName: patch.displayName ?? null,
				color: patch.color ?? null,
				tabOrder: patch.tabOrder ?? null,
			})
			.run();
	}
	return broadcast(ctx, scope);
}

/** Remove one folder's presentation row (folder deletion). Idempotent. */
export function deleteTagFolderSetting(
	ctx: TagFolderStoreContext,
	scope: string,
	rawTag: string,
): TagSettingSnapshot[] | undefined {
	const tag = normalizeWorkspaceTag(rawTag);
	if (tag == null) return undefined;
	ctx.db
		.delete(tagFolderSettings)
		.where(
			and(eq(tagFolderSettings.scope, scope), eq(tagFolderSettings.tag, tag)),
		)
		.run();
	return broadcast(ctx, scope);
}
