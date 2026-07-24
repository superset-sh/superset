import { randomUUID } from "node:crypto";
import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { getHostId } from "@superset/shared/host-info";
import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
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
 * Workspaces have no cloud mirror since local-first (#5731), so the cloud
 * capture in `v2Workspace.create`/`delete` never fires for local rows —
 * the host relays the event through `analytics.captureEvent` instead.
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

/** Delete a local row and broadcast. Idempotent. */
export function deleteLocalWorkspace(
	ctx: WorkspaceStoreContext,
	id: string,
): void {
	const existing = getLocalWorkspace(ctx.db, id);
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
