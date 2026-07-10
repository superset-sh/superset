import { randomUUID } from "node:crypto";
import { getHostId } from "@superset/shared/host-info";
import { and, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaceCloudDeletes, workspaces } from "../db/schema";
import type { EventBus } from "../events";
import type { WorkspaceSnapshot } from "../events/types";

export type HostWorkspaceRow = typeof workspaces.$inferSelect;

export interface WorkspaceStoreContext {
	db: HostDb;
	eventBus: EventBus;
}

/**
 * Cloud-row-compatible view of a local workspace row. Matches the shape of
 * `v2Workspace.getFromHost` / `create` responses so existing consumers of
 * cloud rows keep working when the host answers from its own table
 * (dual-write era; the cloud shape becomes the only shape in R3).
 */
export interface CloudShapedWorkspace {
	id: string;
	organizationId: string;
	projectId: string;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export function toWorkspaceSnapshot(row: HostWorkspaceRow): WorkspaceSnapshot {
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
	};
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
	projectId: string;
	worktreePath: string;
	branch: string;
	name: string;
	type?: "main" | "worktree";
	taskId?: string | null;
	createdByUserId?: string | null;
}

/**
 * Insert a fully-populated local workspace row (host mints the id when the
 * caller didn't) and broadcast `workspace:changed`. The row starts
 * cloud-unsynced; callers push to the cloud best-effort afterwards.
 */
export function insertLocalWorkspace(
	ctx: WorkspaceStoreContext,
	values: InsertLocalWorkspaceValues,
): HostWorkspaceRow {
	const now = Date.now();
	const id = values.id ?? randomUUID();
	ctx.db
		.insert(workspaces)
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
			cloudSyncedAt: null,
		})
		.run();
	const row = getLocalWorkspace(ctx.db, id);
	if (!row) throw new Error(`Workspace insert readback failed: ${id}`);
	emitWorkspaceChanged(ctx.eventBus, "created", row);
	return row;
}

export interface UpdateLocalWorkspacePatch {
	name?: string;
	branch?: string;
	worktreePath?: string;
	taskId?: string | null;
	projectId?: string;
}

/**
 * Patch a local row, bump `updatedAt`, broadcast, and (by default) mark it
 * cloud-dirty so the reconciler pushes it. Pass `cloudDirty: false` for
 * machine-state-only changes the cloud doesn't mirror.
 */
export function updateLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	patch: UpdateLocalWorkspacePatch,
	opts?: { cloudDirty?: boolean },
): HostWorkspaceRow | undefined {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return undefined;
	ctx.db
		.update(workspaces)
		.set({
			...patch,
			updatedAt: Date.now(),
			...((opts?.cloudDirty ?? true) ? { cloudSyncedAt: null } : {}),
		})
		.where(eq(workspaces.id, id))
		.run();
	const row = getLocalWorkspace(ctx.db, id);
	if (row) emitWorkspaceChanged(ctx.eventBus, "updated", row);
	return row;
}

/**
 * Mark a row cloud-synced. Pass `expectedUpdatedAt` (the row's updatedAt as
 * of the push) so a write that landed mid-push keeps its dirty flag —
 * otherwise an in-flight push could silently clear a concurrent rename.
 */
export function markWorkspaceCloudSynced(
	db: HostDb,
	id: string,
	opts?: { expectedUpdatedAt?: number; syncedAt?: number },
): void {
	db.update(workspaces)
		.set({ cloudSyncedAt: opts?.syncedAt ?? Date.now() })
		.where(
			opts?.expectedUpdatedAt !== undefined
				? and(
						eq(workspaces.id, id),
						eq(workspaces.updatedAt, opts.expectedUpdatedAt),
					)
				: eq(workspaces.id, id),
		)
		.run();
}

/**
 * Delete a local row, broadcast, and tombstone the id so the reconciler can
 * replay the delete against the cloud once it's reachable. Idempotent.
 */
export function deleteLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	opts?: { queueCloudDelete?: boolean },
): void {
	const existing = getLocalWorkspace(ctx.db, id);
	ctx.db.delete(workspaces).where(eq(workspaces.id, id)).run();
	if (opts?.queueCloudDelete ?? true) {
		ctx.db
			.insert(workspaceCloudDeletes)
			.values({ id, queuedAt: Date.now() })
			.onConflictDoNothing()
			.run();
	}
	if (existing) {
		ctx.eventBus.broadcastWorkspaceChanged({
			workspaceId: id,
			eventType: "deleted",
			workspace: null,
			occurredAt: Date.now(),
		});
	}
}

export function clearWorkspaceCloudTombstone(db: HostDb, id: string): void {
	db.delete(workspaceCloudDeletes)
		.where(eq(workspaceCloudDeletes.id, id))
		.run();
}

export function listUnsyncedWorkspaces(db: HostDb): HostWorkspaceRow[] {
	return db
		.select()
		.from(workspaces)
		.where(isNull(workspaces.cloudSyncedAt))
		.all();
}

export function listWorkspaceCloudTombstones(db: HostDb): { id: string }[] {
	return db
		.select({ id: workspaceCloudDeletes.id })
		.from(workspaceCloudDeletes)
		.all();
}

/**
 * Re-key a local row onto a cloud-assigned id (main-workspace dedupe: the
 * cloud already had a main for this project/host under a different id).
 * Emits deleted+created so live consumers converge on the surviving id.
 */
export function relinkLocalWorkspaceId(
	ctx: WorkspaceStoreContext,
	oldId: string,
	newId: string,
): HostWorkspaceRow | undefined {
	const existing = getLocalWorkspace(ctx.db, oldId);
	if (!existing || oldId === newId) return existing;
	// A row may already exist under the target id; keep it and drop ours.
	const target = getLocalWorkspace(ctx.db, newId);
	if (target) {
		deleteLocalWorkspace(ctx, oldId, { queueCloudDelete: false });
		return target;
	}
	// Atomic re-key: a crash between delete and insert must not lose the
	// only record of the workspace. Events broadcast after commit.
	const now = Date.now();
	ctx.db.transaction((tx) => {
		tx.delete(workspaces).where(eq(workspaces.id, oldId)).run();
		tx.insert(workspaces)
			.values({
				id: newId,
				projectId: existing.projectId,
				worktreePath: existing.worktreePath,
				branch: existing.branch,
				name: existing.name || existing.branch,
				type: existing.type,
				taskId: existing.taskId,
				createdByUserId: existing.createdByUserId,
				createdAt: now,
				updatedAt: now,
				cloudSyncedAt: null,
			})
			.run();
	});
	ctx.eventBus.broadcastWorkspaceChanged({
		workspaceId: oldId,
		eventType: "deleted",
		workspace: null,
		occurredAt: Date.now(),
	});
	const row = getLocalWorkspace(ctx.db, newId);
	if (!row) throw new Error(`Workspace relink readback failed: ${newId}`);
	emitWorkspaceChanged(ctx.eventBus, "created", row);
	return row;
}

function emitWorkspaceChanged(
	eventBus: EventBus,
	eventType: "created" | "updated",
	row: HostWorkspaceRow,
): void {
	eventBus.broadcastWorkspaceChanged({
		workspaceId: row.id,
		eventType,
		workspace: toWorkspaceSnapshot(row),
		occurredAt: Date.now(),
	});
}
