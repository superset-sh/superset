import {
	isWorkspaceTagVisibleTo,
	normalizeWorkspaceTag,
	SESSIONS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import { and, eq, inArray } from "drizzle-orm";
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
	/** The acting user: folders they customise are theirs. */
	userId?: string;
}

export interface UpsertTagSettingPatch {
	displayName?: string | null;
	color?: string | null;
	tabOrder?: number | null;
}

/**
 * Stored creator for a folder customised before folders had an owner (the
 * column is NOT NULL so it can sit in the primary key). Visible to everyone
 * until someone customises the folder again, which claims the row.
 */
const UNKNOWN_FOLDER_CREATOR = "";

function toStoredCreator(userId: string | null | undefined): string {
	return userId ?? UNKNOWN_FOLDER_CREATOR;
}

function fromStoredCreator(stored: string): string | null {
	return stored === UNKNOWN_FOLDER_CREATOR ? null : stored;
}

type TagFolderSettingRow = typeof tagFolderSettings.$inferSelect;

/**
 * The rows `viewerUserId` sees, one per (scope, tag): their own row wins
 * over a creator-less one for the same folder. A viewer with no identity
 * sees everything, so an older caller behaves as before.
 */
function visibleRows(
	rows: TagFolderSettingRow[],
	viewerUserId: string | null | undefined,
): TagFolderSettingRow[] {
	const byFolder = new Map<string, TagFolderSettingRow>();
	for (const row of rows) {
		const creator = fromStoredCreator(row.createdByUserId);
		if (!isWorkspaceTagVisibleTo(creator, viewerUserId)) continue;
		const key = `${row.scope}:${row.tag}`;
		const isOwn = creator !== null && creator === viewerUserId;
		if (!byFolder.has(key) || isOwn) byFolder.set(key, row);
	}
	return [...byFolder.values()];
}

function toSnapshot(row: TagFolderSettingRow): TagSettingSnapshot {
	return {
		tag: row.tag,
		displayName: row.displayName,
		color: row.color,
		tabOrder: row.tabOrder,
	};
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
 * Every folder presentation row `viewerUserId` can see on this host, across
 * all scopes. The table holds one row per *customised* folder, so this stays
 * small — the renderer fans it out per host rather than plumbing per-host
 * scope lists.
 */
export function getAllTagFolderSettings(
	db: HostDb,
	viewerUserId: string | null | undefined,
): TagFolderSettingSnapshot[] {
	return visibleRows(db.select().from(tagFolderSettings).all(), viewerUserId)
		.map((row) => ({ scope: row.scope, ...toSnapshot(row) }))
		.sort(
			(left, right) =>
				left.scope.localeCompare(right.scope) ||
				left.tag.localeCompare(right.tag),
		);
}

/** One scope's folder presentation rows as the viewer sees them, by tag. */
export function getTagFolderSettings(
	db: HostDb,
	scope: string,
	viewerUserId: string | null | undefined,
): TagSettingSnapshot[] {
	return visibleRows(
		db
			.select()
			.from(tagFolderSettings)
			.where(eq(tagFolderSettings.scope, scope))
			.all(),
		viewerUserId,
	)
		.map(toSnapshot)
		.sort((left, right) => left.tag.localeCompare(right.tag));
}

/**
 * Tell connected renderers the scope changed; they refetch their own view.
 * The payload is the actor's view — it is not per recipient, so nothing
 * should render from it directly.
 */
function broadcast(
	ctx: TagFolderStoreContext,
	scope: string,
): TagSettingSnapshot[] {
	const settings = getTagFolderSettings(ctx.db, scope, ctx.userId);
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
 * Merge-upsert one folder's presentation for the acting user and broadcast
 * the scope to connected renderers. Absent patch fields keep their stored
 * value; a row is created on first customisation (never up front). Making
 * the label a row here is what turns rename into ONE update — the tag stays
 * the stable slug agents target.
 *
 * A creator-less row for the folder (customised before folders had owners)
 * is what the actor was seeing, so customising again claims it rather than
 * leaving two rows that disagree.
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
	const createdByUserId = toStoredCreator(ctx.userId);
	const ownOrUnclaimed = and(
		eq(tagFolderSettings.scope, scope),
		eq(tagFolderSettings.tag, tag),
		inArray(tagFolderSettings.createdByUserId, [
			createdByUserId,
			UNKNOWN_FOLDER_CREATOR,
		]),
	);
	ctx.db.transaction((tx) => {
		const candidates = tx
			.select()
			.from(tagFolderSettings)
			.where(ownOrUnclaimed)
			.all();
		const existing =
			candidates.find((row) => row.createdByUserId === createdByUserId) ??
			candidates[0];
		if (candidates.length > 0) {
			tx.delete(tagFolderSettings).where(ownOrUnclaimed).run();
		}
		tx.insert(tagFolderSettings)
			.values({
				scope,
				tag,
				createdByUserId,
				displayName:
					patch.displayName !== undefined
						? patch.displayName
						: (existing?.displayName ?? null),
				color:
					patch.color !== undefined ? patch.color : (existing?.color ?? null),
				tabOrder:
					patch.tabOrder !== undefined
						? patch.tabOrder
						: (existing?.tabOrder ?? null),
				updatedAt: Date.now(),
			})
			.run();
	});
	return broadcast(ctx, scope);
}

/**
 * Remove the acting user's presentation row for one folder (folder
 * deletion), along with any creator-less row they were seeing. Idempotent.
 * Other users' rows for the same tag are theirs and stay; a caller with no
 * identity removes every row, as before.
 */
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
			and(
				eq(tagFolderSettings.scope, scope),
				eq(tagFolderSettings.tag, tag),
				ctx.userId == null
					? undefined
					: inArray(tagFolderSettings.createdByUserId, [
							ctx.userId,
							UNKNOWN_FOLDER_CREATOR,
						]),
			),
		)
		.run();
	return broadcast(ctx, scope);
}
