import {
	isWorkspaceTagVisibleTo,
	normalizeWorkspaceTag,
	PROJECTS_TAG_SCOPE,
	SESSIONS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { HostDb } from "../db";
import {
	projectCollectionDeletions,
	projects,
	tagFolderSettings,
} from "../db/schema";
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
	updatedAt?: number;
	replay?: boolean;
	create?: boolean;
	createdAt?: number;
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
		...(row.scope === PROJECTS_TAG_SCOPE ? { updatedAt: row.updatedAt } : {}),
		displayName: row.displayName,
		color: row.color,
		tabOrder: row.tabOrder,
	};
}

function pruneProjectCollectionDeletions(
	tx: Parameters<Parameters<HostDb["transaction"]>[0]>[0],
	createdByUserId: string,
) {
	const retained = tx
		.select({ tag: projectCollectionDeletions.tag })
		.from(projectCollectionDeletions)
		.where(eq(projectCollectionDeletions.createdByUserId, createdByUserId))
		.orderBy(
			desc(projectCollectionDeletions.deletedAt),
			projectCollectionDeletions.tag,
		)
		.limit(1024);
	tx.delete(projectCollectionDeletions)
		.where(
			and(
				eq(projectCollectionDeletions.createdByUserId, createdByUserId),
				notInArray(projectCollectionDeletions.tag, retained),
			),
		)
		.run();
}

export function hasTagFolderScope(db: HostDb, scope: string): boolean {
	if (scope === SESSIONS_TAG_SCOPE || scope === PROJECTS_TAG_SCOPE) return true;
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
 * The router validates that project scopes exist before calling this store.
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
		if (scope === PROJECTS_TAG_SCOPE)
			pruneProjectCollectionDeletions(tx, createdByUserId);
		const candidates = tx
			.select()
			.from(tagFolderSettings)
			.where(ownOrUnclaimed)
			.all();
		const existing =
			candidates.find((row) => row.createdByUserId === createdByUserId) ??
			candidates[0];
		const deletion =
			scope === PROJECTS_TAG_SCOPE
				? tx
						.select()
						.from(projectCollectionDeletions)
						.where(
							and(
								eq(projectCollectionDeletions.tag, tag),
								inArray(projectCollectionDeletions.createdByUserId, [
									createdByUserId,
									UNKNOWN_FOLDER_CREATOR,
								]),
							),
						)
						.all()
						.reduce((latest, row) => Math.max(latest, row.deletedAt), 0)
				: 0;
		if (
			scope === PROJECTS_TAG_SCOPE &&
			patch.replay &&
			(patch.updatedAt === undefined ||
				(existing ? patch.updatedAt <= existing.updatedAt : !patch.create) ||
				patch.updatedAt <= deletion ||
				(!existing && (patch.createdAt ?? patch.updatedAt) <= deletion))
		)
			return;
		if (
			scope === PROJECTS_TAG_SCOPE &&
			patch.updatedAt !== undefined &&
			existing &&
			patch.updatedAt < existing.updatedAt
		)
			return;
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
				updatedAt:
					scope === PROJECTS_TAG_SCOPE
						? (patch.updatedAt ??
							Math.max(
								Date.now(),
								(existing?.updatedAt ?? 0) + 1,
								deletion + 1,
							))
						: Date.now(),
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
	deletedAt?: number,
): TagSettingSnapshot[] | undefined {
	const tag = normalizeWorkspaceTag(rawTag);
	if (tag == null) return undefined;
	ctx.db.transaction((tx) => {
		if (scope === PROJECTS_TAG_SCOPE) {
			const creators =
				ctx.userId == null
					? undefined
					: inArray(tagFolderSettings.createdByUserId, [
							ctx.userId,
							UNKNOWN_FOLDER_CREATOR,
						]);
			const existing = tx
				.select()
				.from(tagFolderSettings)
				.where(
					and(
						eq(tagFolderSettings.scope, scope),
						eq(tagFolderSettings.tag, tag),
						creators,
					),
				)
				.all();
			const priorDeletions = tx
				.select()
				.from(projectCollectionDeletions)
				.where(
					and(
						eq(projectCollectionDeletions.tag, tag),
						ctx.userId == null
							? undefined
							: inArray(projectCollectionDeletions.createdByUserId, [
									ctx.userId,
									UNKNOWN_FOLDER_CREATOR,
								]),
					),
				)
				.all();
			if (
				deletedAt !== undefined &&
				existing.some((row) => row.updatedAt > deletedAt)
			)
				return;
			const effectiveDeletedAt = Math.max(
				deletedAt ?? Date.now(),
				...(deletedAt === undefined
					? existing.map((row) => row.updatedAt + 1)
					: []),
				...priorDeletions.map((row) => row.deletedAt),
			);
			const affectedCreators = new Set([
				toStoredCreator(ctx.userId),
				...existing.map((row) => row.createdByUserId),
			]);
			for (const creator of affectedCreators)
				tx.insert(projectCollectionDeletions)
					.values({
						tag,
						createdByUserId: creator,
						deletedAt: effectiveDeletedAt,
					})
					.onConflictDoUpdate({
						target: [
							projectCollectionDeletions.tag,
							projectCollectionDeletions.createdByUserId,
						],
						set: { deletedAt: effectiveDeletedAt },
					})
					.run();
			for (const creator of affectedCreators)
				pruneProjectCollectionDeletions(tx, creator);
		}
		tx.delete(tagFolderSettings)
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
	});
	return broadcast(ctx, scope);
}
