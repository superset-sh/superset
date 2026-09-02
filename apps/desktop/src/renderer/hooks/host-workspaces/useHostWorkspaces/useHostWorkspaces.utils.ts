import type { SelectV2Workspace } from "@superset/db/schema";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type {
	HostConnectionState,
	WorkspaceSnapshotPayload,
} from "@superset/workspace-client";
import { get as idbGet, set as idbSet } from "idb-keyval";

/**
 * The frozen cloud row shape, widened for host-only capabilities the cloud
 * schema never learned: project-less "session" workspaces (null projectId,
 * type "session").
 */
export type HostShapedWorkspace = Omit<
	SelectV2Workspace,
	"projectId" | "type"
> & {
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	type: "main" | "worktree" | "session";
	/**
	 * Normalized, sorted tag set. Optional because a row served by an older
	 * host — or restored from a pre-tags IndexedDB snapshot — carries the
	 * field ABSENT; consumers must guard with `== null` / `?? []`.
	 */
	tags?: string[];
};

/**
 * A workspace row as served by a host (`workspace.list`) — the cloud row
 * shape plus the host-only extras.
 */
export interface HostWorkspaceRow extends HostShapedWorkspace {
	worktreePath: string;
	worktreeExists: boolean;
	/** Non-null = archived tombstone (only served on `includeArchived`). */
	archivedAt?: number | null;
	archiveReason?: "merged" | "deleted" | null;
}

/** Merged item returned by useHostWorkspaces. */
export interface HostWorkspaceItem extends HostShapedWorkspace {
	worktreePath?: string;
	worktreeExists?: boolean;
	/** False when the host didn't answer. */
	hostReachable: boolean;
	/** Non-null = archived tombstone (only present on `includeArchived`). */
	archivedAt?: number | null;
	archiveReason?: "merged" | "deleted" | null;
}

export interface HostWorkspacesQueryTarget {
	machineId: string;
	organizationId: string;
	/** Null when the host is known but unreachable (offline remote). */
	hostUrl: string | null;
	isLocal: boolean;
	/**
	 * A cloud workspace's sandbox, addressed by a brokered URL rather than by
	 * machine identity. Its `machineId` is the cloud workspace's own id — the
	 * sandbox reports an internal one that means nothing to this client.
	 */
	isSandbox?: boolean;
}

export interface HostRowForTargets {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

export function getHostWorkspacesQueryKey(
	target: Pick<HostWorkspacesQueryTarget, "machineId" | "organizationId">,
) {
	// Host identity (org + machine), never hostUrl: the local port moves on
	// restarts and a URL-keyed cache goes cold bar-wide every time. The
	// queryFn resolves the current URL from the target at fetch time.
	return [
		"host-service",
		"workspaces",
		"list",
		target.organizationId,
		target.machineId,
	] as const;
}

/**
 * One target per known host: the local host always (direct URL), remote
 * hosts via relay when online, and a null-URL placeholder when offline.
 */
export function deriveHostWorkspacesQueryTargets({
	activeHostUrl,
	hosts,
	machineId,
	relayUrl,
	fallbackOrganizationId,
	sandboxes = [],
}: {
	activeHostUrl: string | null;
	hosts: HostRowForTargets[];
	machineId: string | null;
	relayUrl: string;
	/** Org for the synthesized local target — see derivePullRequestQueryTargets. */
	fallbackOrganizationId?: string | null;
	/** Cloud workspaces whose sandbox currently has a brokered address. */
	sandboxes?: Array<{
		workspaceId: string;
		organizationId: string;
		url: string;
	}>;
}): HostWorkspacesQueryTarget[] {
	const targets: HostWorkspacesQueryTarget[] = hosts.map((host) => {
		const isLocal = host.machineId === machineId;
		const hostUrl = isLocal
			? activeHostUrl
			: host.isOnline
				? `${relayUrl}/hosts/${buildHostRoutingKey(host.organizationId, host.machineId)}`
				: null;
		return {
			machineId: host.machineId,
			organizationId: host.organizationId,
			hostUrl,
			isLocal,
		};
	});

	// The local host may not have a v2_hosts row yet (fresh install, stale
	// Electric); it is still queryable directly.
	if (
		machineId &&
		activeHostUrl &&
		!targets.some((target) => target.machineId === machineId)
	) {
		targets.push({
			machineId,
			organizationId: hosts[0]?.organizationId ?? fallbackOrganizationId ?? "",
			hostUrl: activeHostUrl,
			isLocal: true,
		});
	}

	for (const sandbox of sandboxes) {
		targets.push({
			machineId: sandbox.workspaceId,
			organizationId: sandbox.organizationId,
			hostUrl: sandbox.url,
			isLocal: false,
			isSandbox: true,
		});
	}

	return targets;
}

const SNAPSHOT_KEY_PREFIX = "host-workspaces:v1";

function snapshotKey(organizationId: string, machineId: string): string {
	return `${SNAPSHOT_KEY_PREFIX}:${organizationId}:${machineId}`;
}

/**
 * Last-seen per-host snapshots in IndexedDB. Dates survive the structured
 * clone, so rows round-trip as-is. Only affects offline visibility of
 * remote hosts — the local host answers live even offline. Persistence
 * failures are deliberately swallowed: the snapshot is a best-effort cache
 * and every failure mode degrades to "fetch live next time".
 */
export async function loadHostWorkspacesSnapshot(
	organizationId: string,
	machineId: string,
): Promise<HostWorkspaceRow[] | undefined> {
	if (!organizationId) return undefined;
	try {
		return await idbGet<HostWorkspaceRow[]>(
			snapshotKey(organizationId, machineId),
		);
	} catch {
		return undefined;
	}
}

export function saveHostWorkspacesSnapshot(
	organizationId: string,
	machineId: string,
	rows: HostWorkspaceRow[],
): void {
	if (!organizationId) return;
	void idbSet(snapshotKey(organizationId, machineId), rows).catch(() => {});
}

/**
 * Whether a connection-status transition means the socket came back up after
 * being down. Events broadcast while down are unrecoverable (the bus has no
 * replay), so every open after the first is a potential gap and the host's
 * mirrors must resync. Keyed on "has opened before", not the previous state:
 * a manual `reconnect()` publishes "connecting" (same as the initial dial)
 * before reopening, so state pairs can't distinguish retry from boot. The
 * first open is not a reopen — the queries' first fetch covers it.
 */
export function isEventBusReopen(
	hasOpenedBefore: boolean,
	next: HostConnectionState,
): boolean {
	return next === "open" && hasOpenedBefore;
}

/**
 * Apply a workspace:changed event to a host's cached list. Created/updated
 * upsert from the event's snapshot payload; deleted removes the row.
 */
export function applyWorkspaceChangedEvent(
	rows: HostWorkspaceRow[] | undefined,
	event: {
		eventType: "created" | "updated" | "deleted";
		workspace: WorkspaceSnapshotPayload | null;
	},
	host: { organizationId: string; machineId: string },
	workspaceId: string,
): HostWorkspaceRow[] | undefined {
	if (event.eventType === "deleted") {
		if (!rows) return rows;
		const next = rows.filter((row) => row.id !== workspaceId);
		return next.length === rows.length ? rows : next;
	}
	const snapshot = event.workspace;
	if (!snapshot) return rows;
	const existing = rows?.find((row) => row.id === snapshot.id);
	const nextRow: HostWorkspaceRow = {
		id: snapshot.id,
		organizationId: host.organizationId,
		projectId: snapshot.projectId,
		hostId: host.machineId,
		name: snapshot.name,
		branch: snapshot.branch,
		type: snapshot.type,
		createdByUserId: snapshot.createdByUserId,
		taskId: snapshot.taskId,
		// Runtime-optional despite the payload type: an older host's events
		// carry no tags — keep the row's last known set rather than wiping it.
		tags: snapshot.tags ?? existing?.tags,
		createdAt: new Date(snapshot.createdAt),
		updatedAt: new Date(snapshot.updatedAt),
		worktreePath: snapshot.worktreePath,
		// A host broadcasting created/updated just acted on the worktree;
		// keep a known value over assuming.
		worktreeExists: existing?.worktreeExists ?? true,
	};
	if (!rows) return [nextRow];
	return existing
		? rows.map((row) => (row.id === nextRow.id ? nextRow : row))
		: [...rows, nextRow];
}

/**
 * Merge per-host results. A host that answered is authoritative for its
 * rows — a deleted row must not resurrect.
 */
export function mergeHostWorkspaces({
	hostResults,
}: {
	hostResults: Array<{
		target: HostWorkspacesQueryTarget;
		rows: HostWorkspaceRow[] | undefined;
		reachable: boolean;
	}>;
}): HostWorkspaceItem[] {
	const items: HostWorkspaceItem[] = [];
	const seenIds = new Set<string>();

	for (const result of hostResults) {
		if (!result.rows) continue;
		for (const row of result.rows) {
			if (seenIds.has(row.id)) continue;
			seenIds.add(row.id);
			items.push({
				...row,
				hostReachable: result.reachable,
			});
		}
	}

	return items;
}
