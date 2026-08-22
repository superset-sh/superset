import { randomUUID } from "node:crypto";
import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { getHostId } from "@superset/shared/host-info";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import type { WorkspaceSpawnOrigin } from "../db/schema";
import { workspaces } from "../db/schema";
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
					parent_present: row.parentWorkspaceId != null,
					spawn_origin: row.spawnOrigin,
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
		parentWorkspaceId: row.parentWorkspaceId,
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
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	worktreePath: string;
	branch: string;
	name: string;
	type?: "main" | "worktree" | "session";
	taskId?: string | null;
	createdByUserId?: string | null;
	/** Pre-validated by the caller (resolveParentWorkspaceId). */
	parentWorkspaceId?: string | null;
	spawnOrigin?: WorkspaceSpawnOrigin | null;
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
			parentWorkspaceId: values.parentWorkspaceId ?? null,
			spawnOrigin: values.spawnOrigin ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.run();
	const row = getLocalWorkspace(ctx.db, id);
	if (!row) throw new Error(`Workspace insert readback failed: ${id}`);
	emitWorkspaceChanged(ctx.eventBus, "created", row);
	trackWorkspaceEvent(ctx, "workspace_created", row);
	return row;
}

export interface UpdateLocalWorkspacePatch {
	name?: string;
	branch?: string;
	worktreePath?: string;
	taskId?: string | null;
	projectId?: string;
	/** Pre-validated by the caller (existence, project, cycle guard). */
	parentWorkspaceId?: string | null;
}

/** Patch a local row, bump `updatedAt`, and broadcast. */
export function updateLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
	patch: UpdateLocalWorkspacePatch,
): HostWorkspaceRow | undefined {
	const existing = getLocalWorkspace(ctx.db, id);
	if (!existing) return undefined;
	ctx.db
		.update(workspaces)
		.set({
			...patch,
			updatedAt: Date.now(),
		})
		.where(eq(workspaces.id, id))
		.run();
	const row = getLocalWorkspace(ctx.db, id);
	if (row) emitWorkspaceChanged(ctx.eventBus, "updated", row);
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
	// The parent_workspace_id FK was added via ALTER TABLE, where SQLite
	// records no ON DELETE action — detach children here so the delete
	// can't trip enforcement, matching the schema's set-null intent.
	ctx.db
		.update(workspaces)
		.set({ parentWorkspaceId: null })
		.where(eq(workspaces.parentWorkspaceId, id))
		.run();
	ctx.db.delete(workspaces).where(eq(workspaces.id, id)).run();
	if (existing) {
		ctx.eventBus.broadcastWorkspaceChanged({
			workspaceId: id,
			eventType: "deleted",
			workspace: null,
			occurredAt: Date.now(),
		});
		trackWorkspaceEvent(ctx, "workspace_deleted", existing);
	}
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
	if (row) emitWorkspaceChanged(ctx.eventBus, "created", row);
}

/**
 * Validate a requested lineage parent for a workspace about to be created
 * in `projectId`. A parent that doesn't exist, is archived, or belongs to a
 * different project records NO lineage (null) with a warning — a wrong edge
 * is worse than a flat row, and callers often infer the parent from
 * environment rather than an explicit flag.
 */
export function resolveParentWorkspaceId(
	db: HostDb,
	requestedParentId: string | undefined,
	projectId: string | null,
): string | null {
	if (!requestedParentId) return null;
	const parent = getLocalWorkspace(db, requestedParentId);
	if (!parent) {
		console.warn(
			`[workspaces] ignoring unknown parent workspace ${requestedParentId}`,
		);
		return null;
	}
	if (parent.archivedAt != null) {
		console.warn(
			`[workspaces] ignoring archived parent workspace ${requestedParentId}`,
		);
		return null;
	}
	if (parent.projectId !== projectId) {
		console.warn(
			`[workspaces] ignoring cross-project parent workspace ${requestedParentId}`,
		);
		return null;
	}
	return parent.id;
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
