import { randomUUID } from "node:crypto";
import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { getHostId } from "@superset/shared/host-info";
import { normalizeWorkspaceTags } from "@superset/shared/workspace-tags";
import { eq, inArray } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces, workspaceTags } from "../db/schema";
import type { EventBus } from "../events";
import type { WorkspaceSnapshot } from "../events/types";
import type { ApiClient } from "../types";

export type HostWorkspaceRow = typeof workspaces.$inferSelect;

/**
 * `api`/`organizationId`/`clientMachineId` mirror `HostServiceContext` field
 * names so a full request context satisfies this interface as-is. When `api`
 * is absent the store still works but skips telemetry.
 */
export interface WorkspaceStoreContext {
	db: HostDb;
	eventBus: EventBus;
	api?: ApiClient;
	organizationId?: string;
	clientMachineId?: string;
}

/**
 * Workspaces have no cloud mirror since local-first (#5731), so the host
 * relays workspace lifecycle events through `analytics.captureEvent`.
 */
function trackWorkspaceEvent(
	ctx: WorkspaceStoreContext,
	event: "workspace_created" | "workspace_deleted",
	row: HostWorkspaceRow,
): void {
	if (!ctx.api) return;
	const clientMachineId = ctx.clientMachineId ?? getHostId();
	try {
		void ctx.api.analytics.captureEvent
			.mutate({
				source: "host_service",
				event,
				properties: {
					workspace_id: row.id,
					project_id: row.projectId,
					organization_id: ctx.organizationId ?? null,
					host_id: getHostId(),
					branch: row.branch,
					type: row.type,
					host_kind: clientMachineId === getHostId() ? "local" : "remote",
					client_machine_id: clientMachineId,
					host_service_version: hostServicePackageJson.version,
				},
			})
			.catch(() => {});
	} catch {
		// Telemetry must never fail the workspace operation.
	}
}

/**
 * The workspace row shape the host serves: the frozen cloud column set,
 * kept so consumers written against the old cloud rows keep working now
 * that the host answers from its own table.
 */
export interface CloudShapedWorkspace {
	id: string;
	organizationId: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree" | "session";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export function toWorkspaceSnapshot(
	row: HostWorkspaceRow,
	tags: string[],
): WorkspaceSnapshot {
	return {
		id: row.id,
		projectId: row.projectId,
		name: row.name || row.branch,
		branch: row.branch,
		type: row.type,
		worktreePath: row.worktreePath,
		taskId: row.taskId,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt || row.createdAt,
		lastActivityAt: row.lastActivityAt,
		tags,
	};
}

/** A workspace's tags, already-normalized in storage, read back sorted. */
export function getWorkspaceTags(db: HostDb, workspaceId: string): string[] {
	return db
		.select({ tag: workspaceTags.tag })
		.from(workspaceTags)
		.where(eq(workspaceTags.workspaceId, workspaceId))
		.all()
		.map((row) => row.tag)
		.sort();
}

/** Batch tag lookup for list responses; ids absent from the map have none. */
export function getWorkspaceTagsByWorkspaceId(
	db: HostDb,
	workspaceIds: string[],
): Map<string, string[]> {
	const byWorkspace = new Map<string, string[]>();
	if (workspaceIds.length === 0) return byWorkspace;
	const rows = db
		.select({ workspaceId: workspaceTags.workspaceId, tag: workspaceTags.tag })
		.from(workspaceTags)
		.where(inArray(workspaceTags.workspaceId, workspaceIds))
		.all();
	for (const row of rows) {
		const tags = byWorkspace.get(row.workspaceId);
		if (tags) {
			tags.push(row.tag);
		} else {
			byWorkspace.set(row.workspaceId, [row.tag]);
		}
	}
	for (const tags of byWorkspace.values()) tags.sort();
	return byWorkspace;
}

export function toCloudShape(
	row: HostWorkspaceRow,
	organizationId: string,
): CloudShapedWorkspace {
	return {
		id: row.id,
		organizationId,
		projectId: row.projectId,
		hostId: getHostId(),
		// Rows that predate local ownership have an empty name until the
		// backfill sweep fills it; branch is the honest fallback.
		name: row.name || row.branch,
		branch: row.branch,
		type: row.type,
		createdByUserId: row.createdByUserId,
		taskId: row.taskId,
		createdAt: new Date(row.createdAt),
		updatedAt: new Date(row.updatedAt || row.createdAt),
	};
}

export function getLocalWorkspace(
	db: HostDb,
	id: string,
): HostWorkspaceRow | undefined {
	return db.query.workspaces.findFirst({ where: eq(workspaces.id, id) }).sync();
}

export interface InsertLocalWorkspaceValues {
	id?: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	worktreePath: string;
	branch: string;
	name: string;
	type?: "main" | "worktree" | "session";
	taskId?: string | null;
	createdByUserId?: string | null;
	tags?: string[];
}

/**
 * Insert a fully-populated local workspace row (host mints the id when the
 * caller didn't) and broadcast `workspace:changed`.
 */
export function insertLocalWorkspace(
	ctx: WorkspaceStoreContext,
	values: InsertLocalWorkspaceValues,
): HostWorkspaceRow {
	const now = Date.now();
	const id = values.id ?? randomUUID();
	const tags = normalizeWorkspaceTags(values.tags);
	ctx.db.transaction((tx) => {
		tx.insert(workspaces)
			.values({
				id,
				projectId: values.projectId,
				worktreePath: values.worktreePath,
				branch: values.branch,
				name: values.name,
				type: values.type ?? "worktree",
				taskId: values.taskId ?? null,
				createdByUserId: values.createdByUserId ?? null,
				createdAt: now,
				updatedAt: now,
			})
			.run();
		if (tags.length > 0) {
			tx.insert(workspaceTags)
				.values(tags.map((tag) => ({ workspaceId: id, tag, createdAt: now })))
				.run();
		}
	});
	const row = getLocalWorkspace(ctx.db, id);
	if (!row) throw new Error(`Workspace insert readback failed: ${id}`);
	emitWorkspaceChanged(ctx, "created", row);
	trackWorkspaceEvent(ctx, "workspace_created", row);
	return row;
}

export interface UpdateLocalWorkspacePatch {
	name?: string;
	branch?: string;
	worktreePath?: string;
	taskId?: string | null;
	projectId?: string;
	/** Full replacement of the tag set; already-normalized by the caller. */
	tags?: string[];
}

/** Patch a local row, bump `updatedAt`, and broadcast. */
export function updateLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	patch: UpdateLocalWorkspacePatch,
): HostWorkspaceRow | undefined {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return undefined;
	const { tags, ...columns } = patch;
	const normalizedTags =
		tags === undefined ? undefined : normalizeWorkspaceTags(tags);
	// Tag replacement is delete-then-insert; the transaction keeps a throw
	// between them from losing the whole set.
	ctx.db.transaction((tx) => {
		tx.update(workspaces)
			.set({
				...columns,
				updatedAt: Date.now(),
			})
			.where(eq(workspaces.id, id))
			.run();
		if (normalizedTags !== undefined) {
			tx.delete(workspaceTags).where(eq(workspaceTags.workspaceId, id)).run();
			if (normalizedTags.length > 0) {
				const now = Date.now();
				tx.insert(workspaceTags)
					.values(
						normalizedTags.map((tag) => ({
							workspaceId: id,
							tag,
							createdAt: now,
						})),
					)
					.run();
			}
		}
	});
	const row = getLocalWorkspace(ctx.db, id);
	if (row) emitWorkspaceChanged(ctx, "updated", row);
	return row;
}

/** Hard-delete a local row and broadcast. Idempotent. The destroy pipeline
 * archives via `archiveLocalWorkspace` instead — this remains only for
 * phantom-row cleanup (adopt-existing-worktree conflicts). */
export function deleteLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	ctx.db.delete(workspaces).where(eq(workspaces.id, id)).run();
	if (existing) emitLocalWorkspaceDeleted(ctx, existing);
}

/** Broadcast/track a row deleted by a larger transaction (for example project removal). */
export function emitLocalWorkspaceDeleted(
	ctx: WorkspaceStoreContext,
	row: HostWorkspaceRow,
): void {
	ctx.eventBus.broadcastWorkspaceChanged({
		workspaceId: row.id,
		eventType: "deleted",
		workspace: null,
		occurredAt: Date.now(),
	});
	trackWorkspaceEvent(ctx, "workspace_deleted", row);
}

/**
 * Tombstone a local row instead of deleting it. Broadcasts the same
 * `deleted` event shape as a hard delete so every existing consumer drops
 * the row identically; the row itself survives for the board's
 * Merged/Deleted history. Idempotent — re-archiving keeps the original
 * timestamp and reason.
 */
export function archiveLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	reason: "merged" | "deleted",
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return;
	if (existing.archivedAt == null) {
		ctx.db
			.update(workspaces)
			.set({
				archivedAt: Date.now(),
				archiveReason: reason,
				updatedAt: Date.now(),
			})
			.where(eq(workspaces.id, id))
			.run();
	}
	ctx.eventBus.broadcastWorkspaceChanged({
		workspaceId: id,
		eventType: "deleted",
		workspace: null,
		occurredAt: Date.now(),
	});
	// Telemetry deliberately NOT emitted here: the destroy can still fail
	// and un-archive. The pipeline calls trackWorkspaceDeleted once the
	// physical cleanup actually commits.
}

/** Emit the deletion telemetry event — called by the destroy pipeline
 * after physical cleanup succeeds, so failed/retried destroys count once. */
export function trackWorkspaceDeleted(
	ctx: WorkspaceStoreContext,
	row: HostWorkspaceRow,
): void {
	trackWorkspaceEvent(ctx, "workspace_deleted", row);
}

/**
 * Revive a tombstoned row — the destroy pipeline failed after the
 * mark-first commit, so the workspace is live and retryable again.
 * Broadcasts `created` so list patchers that dropped the row on the
 * archive event re-add it. Idempotent.
 */
export function unarchiveLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return;
	if (existing.archivedAt != null) {
		ctx.db
			.update(workspaces)
			.set({ archivedAt: null, archiveReason: null, updatedAt: Date.now() })
			.where(eq(workspaces.id, id))
			.run();
	}
	const row = getLocalWorkspace(ctx.db, id);
	if (row) emitWorkspaceChanged(ctx, "created", row);
}

/**
 * Agent hooks fire on every tool call; one write per burst is plenty for a
 * "last active" ranking, and it keeps a chatty agent from broadcasting a
 * workspace:changed per tool use.
 */
export const WORKSPACE_ACTIVITY_THROTTLE_MS = 30_000;

/**
 * Record agent activity on a live workspace: stamp `lastActivityAt` and
 * broadcast the row as `updated`. The first event after a quiet period
 * writes immediately; further events inside the throttle window are
 * dropped. Only `lastActivityAt` moves — `updatedAt` stays a metadata
 * signal, and no analytics fire (unlike create/delete, a touch is not a
 * workspace lifecycle event).
 *
 * Returns whether a write happened, for the caller's own bookkeeping.
 */
export function touchLocalWorkspaceActivity(
	ctx: Pick<WorkspaceStoreContext, "db" | "eventBus">,
	id: string,
	occurredAt: number,
): boolean {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing || existing.archivedAt != null) return false;
	if (
		existing.lastActivityAt != null &&
		occurredAt - existing.lastActivityAt < WORKSPACE_ACTIVITY_THROTTLE_MS
	) {
		return false;
	}
	ctx.db
		.update(workspaces)
		.set({ lastActivityAt: occurredAt })
		.where(eq(workspaces.id, id))
		.run();
	emitWorkspaceChanged(ctx, "updated", {
		...existing,
		lastActivityAt: occurredAt,
	});
	return true;
}

function emitWorkspaceChanged(
	ctx: Pick<WorkspaceStoreContext, "db" | "eventBus">,
	eventType: "created" | "updated",
	row: HostWorkspaceRow,
): void {
	ctx.eventBus.broadcastWorkspaceChanged({
		workspaceId: row.id,
		eventType,
		workspace: toWorkspaceSnapshot(row, getWorkspaceTags(ctx.db, row.id)),
		occurredAt: Date.now(),
	});
}
