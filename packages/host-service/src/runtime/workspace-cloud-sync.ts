import { getHostId, getHostName } from "@superset/shared/host-info";
import type { HostDb } from "../db";
import type { EventBus } from "../events";
import type { ApiClient } from "../types";
import {
	clearWorkspaceCloudTombstone,
	type HostWorkspaceRow,
	listUnsyncedWorkspaces,
	listWorkspaceCloudTombstones,
	markWorkspaceCloudSynced,
	relinkLocalWorkspaceId,
	updateLocalWorkspace,
} from "../workspaces/local-workspace-store";

export interface WorkspaceCloudSyncContext {
	api: ApiClient;
	db: HostDb;
	eventBus: EventBus;
	organizationId: string;
	clientMachineId?: string;
}

export type CloudCreateResult = Awaited<
	ReturnType<ApiClient["v2Workspace"]["create"]["mutate"]>
>;

const HOST_ENSURE_TTL_MS = 60_000;
interface HostEnsureCacheEntry {
	at: number;
	promise: Promise<{ machineId: string }>;
}
// Keyed on the ApiClient instance (prod has exactly one per process) so
// test harnesses with fresh fake clients never share a stale entry.
const hostEnsureCache = new WeakMap<ApiClient, HostEnsureCacheEntry>();

/**
 * `host.ensure` is idempotent registration; every create/reconcile push
 * needs the machineId but re-registering per call is wasted round-trips
 * (the reconciler would otherwise call it once per dirty row). Cache the
 * in-flight/recent promise; failures evict so retries re-register.
 */
export function ensureHostRegistered(
	ctx: Pick<WorkspaceCloudSyncContext, "api" | "organizationId">,
): Promise<{ machineId: string }> {
	const now = Date.now();
	const cached = hostEnsureCache.get(ctx.api);
	if (cached && now - cached.at < HOST_ENSURE_TTL_MS) {
		return cached.promise;
	}
	const promise = ctx.api.host.ensure
		.mutate({
			organizationId: ctx.organizationId,
			machineId: getHostId(),
			name: getHostName(),
		})
		.catch((err: unknown) => {
			if (hostEnsureCache.get(ctx.api)?.promise === promise) {
				hostEnsureCache.delete(ctx.api);
			}
			throw err;
		});
	hostEnsureCache.set(ctx.api, { at: now, promise });
	return promise;
}

/**
 * Best-effort push of a local workspace row to the cloud mirror. Returns the
 * cloud row (with txid) on success, null when the cloud is unreachable or
 * rejects — the row stays cloud-dirty and the reconciler retries.
 *
 * Cloud `create` is id-idempotent, so this doubles as "create or confirm".
 * A differing returned id means the cloud deduped a main workspace it
 * already had; the local row is re-keyed onto the surviving cloud id.
 */
export async function pushWorkspaceCreateToCloud(
	ctx: WorkspaceCloudSyncContext,
	row: HostWorkspaceRow,
): Promise<CloudCreateResult | null> {
	try {
		const host = await ensureHostRegistered(ctx);
		const cloudRow = await ctx.api.v2Workspace.create.mutate({
			organizationId: ctx.organizationId,
			projectId: row.projectId,
			name: row.name || row.branch,
			branch: row.branch,
			hostId: host.machineId,
			type: row.type,
			taskId: row.taskId ?? undefined,
			id: row.id,
			clientMachineId: ctx.clientMachineId ?? getHostId(),
		});
		if (cloudRow.id !== row.id) {
			const relinked = relinkLocalWorkspaceId(
				{ db: ctx.db, eventBus: ctx.eventBus },
				row.id,
				cloudRow.id,
			);
			markWorkspaceCloudSynced(ctx.db, cloudRow.id, {
				expectedUpdatedAt: relinked?.updatedAt,
			});
			return cloudRow;
		}
		// The idempotent-create may return a pre-existing cloud row that
		// diverged: renderer renames still write the cloud directly during
		// dual-write (R1). Branch is always host-truth; for name, last write
		// wins so a newer cloud-side rename isn't clobbered by a row that
		// went dirty for unrelated reasons.
		const localName = row.name || row.branch;
		const cloudNewer = cloudRow.updatedAt.getTime() > (row.updatedAt || 0);
		// Guard against clearing a dirty flag set by a write that landed while
		// this push was in flight — CAS on the updatedAt we pushed.
		let expectedUpdatedAt = row.updatedAt;
		if (cloudNewer && cloudRow.name !== localName) {
			const adopted = updateLocalWorkspace(
				{ db: ctx.db, eventBus: ctx.eventBus },
				row.id,
				{ name: cloudRow.name, taskId: cloudRow.taskId },
				{ cloudDirty: false },
			);
			if (adopted) expectedUpdatedAt = adopted.updatedAt;
		}
		const namePatch =
			!cloudNewer && cloudRow.name !== localName ? { name: localName } : {};
		if (cloudRow.branch !== row.branch || namePatch.name !== undefined) {
			await ctx.api.v2Workspace.updateNameFromHost.mutate({
				id: row.id,
				branch: row.branch,
				...namePatch,
			});
		}
		markWorkspaceCloudSynced(ctx.db, row.id, { expectedUpdatedAt });
		return cloudRow;
	} catch (err) {
		console.warn(
			"[workspace-cloud-sync] cloud push failed; will retry via reconciler",
			{ workspaceId: row.id, err },
		);
		return null;
	}
}

/** Best-effort cloud delete replay for a tombstoned workspace id. */
async function pushWorkspaceDeleteToCloud(
	ctx: WorkspaceCloudSyncContext,
	id: string,
): Promise<void> {
	try {
		await ctx.api.v2Workspace.delete.mutate({ id });
		clearWorkspaceCloudTombstone(ctx.db, id);
	} catch (err) {
		console.warn(
			"[workspace-cloud-sync] cloud delete replay failed; keeping tombstone",
			{ workspaceId: id, err },
		);
	}
}

const RECONCILE_INTERVAL_MS = 60_000;

/**
 * Dual-write reconciler (R1–R2 only; deleted in R3 with the cloud table).
 * Inline cloud pushes are the primary path — this loop only drains what
 * those pushes left behind: cloud-dirty rows and delete tombstones from
 * writes made while the cloud was unreachable.
 */
export function startWorkspaceCloudSync(ctx: WorkspaceCloudSyncContext): {
	stop: () => void;
	runNow: () => Promise<void>;
} {
	let current: Promise<void> | null = null;

	// Concurrent callers share the in-flight pass rather than skipping —
	// `runNow` must be awaitable even while the interval tick is running.
	const run = (): Promise<void> => {
		if (current) return current;
		current = (async () => {
			// Deletes first: a branch deleted-then-recreated offline yields a
			// tombstone plus a fresh dirty row for the same branch; replaying
			// in write order keeps the cloud from briefly holding both.
			for (const tombstone of listWorkspaceCloudTombstones(ctx.db)) {
				await pushWorkspaceDeleteToCloud(ctx, tombstone.id);
			}
			for (const row of listUnsyncedWorkspaces(ctx.db)) {
				// Skip not-yet-backfilled rows — the backfill sweep owns them,
				// and pushing an empty name would clobber the cloud's.
				if (row.name === "" && row.updatedAt === 0) continue;
				await pushWorkspaceCreateToCloud(ctx, row);
			}
		})().finally(() => {
			current = null;
		});
		return current;
	};

	const timer = setInterval(() => {
		void run().catch((err) => {
			console.warn("[workspace-cloud-sync] reconcile pass failed", err);
		});
	}, RECONCILE_INTERVAL_MS);
	timer.unref?.();

	void run().catch((err) => {
		console.warn("[workspace-cloud-sync] initial reconcile failed", err);
	});

	return {
		stop: () => clearInterval(timer),
		runNow: run,
	};
}
