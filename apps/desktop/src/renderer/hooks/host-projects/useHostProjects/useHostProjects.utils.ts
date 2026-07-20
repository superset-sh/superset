import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { ProjectSnapshotPayload } from "@superset/workspace-client";
import { del as idbDel, get as idbGet, set as idbSet } from "idb-keyval";

/** A project row as served by a host (`project.list`). */
export interface HostProjectRow {
	id: string;
	name: string;
	repoPath: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	worktreeBaseDir: string | null;
	createdAt: number;
	updatedAt: number;
}

/**
 * Merged item returned by useHostProjects. One item per logical project —
 * legacy cloud-created projects share one id across hosts, so replicas
 * group on it; local-first projects are per-host by construction.
 */
export interface HostProjectItem {
	/** Grouping key. Today `id`; kept separate so a cloud link can join later. */
	projectKey: string;
	id: string;
	name: string;
	/** Present when some host serves the project. */
	repoPath?: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	/** Hosts that serve this project. */
	hostIds: string[];
	/** False when no serving host answered live (snapshot data only). */
	hostReachable: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface HostProjectsQueryTarget {
	machineId: string;
	organizationId: string;
	/** Null when the host is known but unreachable (offline remote). */
	hostUrl: string | null;
	isLocal: boolean;
}

export interface HostRowForTargets {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
}

export function getHostProjectsQueryKey(
	target: Pick<HostProjectsQueryTarget, "machineId" | "hostUrl">,
) {
	return [
		"host-service",
		"projects",
		"list",
		target.machineId,
		target.hostUrl,
	] as const;
}

/** Same target derivation as useHostWorkspaces — one per known host. */
export function deriveHostProjectsQueryTargets({
	activeHostUrl,
	hosts,
	machineId,
	relayUrl,
	fallbackOrganizationId,
}: {
	activeHostUrl: string | null;
	hosts: HostRowForTargets[];
	machineId: string | null;
	relayUrl: string;
	/**
	 * Org id for the local-host fallback target when the hosts collection
	 * hasn't loaded yet — without it the persisted snapshot can't hydrate
	 * in exactly the cold-start window it exists for.
	 */
	fallbackOrganizationId?: string | null;
}): HostProjectsQueryTarget[] {
	const targets: HostProjectsQueryTarget[] = hosts.map((host) => {
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

	return targets;
}

/**
 * Normalize a project.list row from any host version. Hosts running
 * pre-local-first builds (not-yet-updated desktops, standalone headless
 * hosts) don't serve `name`/`createdAt`/`updatedAt` — fall back the same
 * way the new host does (folder basename; both path separators).
 */
export function normalizeHostProjectRow(
	row: Partial<HostProjectRow> & { id: string; repoPath: string },
): HostProjectRow {
	return {
		id: row.id,
		name: row.name || row.repoPath.split(/[\\/]/).pop() || row.id,
		repoPath: row.repoPath,
		repoOwner: row.repoOwner ?? null,
		repoName: row.repoName ?? null,
		repoUrl: row.repoUrl ?? null,
		worktreeBaseDir: row.worktreeBaseDir ?? null,
		createdAt: row.createdAt ?? 0,
		updatedAt: row.updatedAt ?? row.createdAt ?? 0,
	};
}

const SNAPSHOT_KEY_PREFIX = "host-projects:v1";

function snapshotKey(organizationId: string, machineId: string): string {
	return `${SNAPSHOT_KEY_PREFIX}:${organizationId}:${machineId}`;
}

/** Last-seen per-host snapshots in IndexedDB (remote hosts only, like workspaces). */
export async function loadHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
): Promise<HostProjectRow[] | undefined> {
	if (!organizationId) return undefined;
	try {
		return await idbGet<HostProjectRow[]>(
			snapshotKey(organizationId, machineId),
		);
	} catch {
		return undefined;
	}
}

export function saveHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
	rows: HostProjectRow[],
): void {
	if (!organizationId) return;
	void idbSet(snapshotKey(organizationId, machineId), rows).catch(() => {});
}

export function clearHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
): void {
	if (!organizationId) return;
	void idbDel(snapshotKey(organizationId, machineId)).catch(() => {});
}

// Serialize read-modify-write per snapshot key so rapid deletes can't
// interleave and lose a removal to a stale concurrent write.
const snapshotWriteChains = new Map<string, Promise<void>>();

/**
 * Drop one project from the persisted snapshot. Needed for deleted events
 * that arrive before the query cache hydrates — without this, the stale
 * snapshot would resurrect the deleted project on the next launch.
 */
export function removeFromHostProjectsSnapshot(
	organizationId: string,
	machineId: string,
	projectId: string,
): Promise<void> {
	const key = snapshotKey(organizationId, machineId);
	const chained = (snapshotWriteChains.get(key) ?? Promise.resolve()).then(
		async () => {
			const rows = await loadHostProjectsSnapshot(organizationId, machineId);
			if (!Array.isArray(rows)) return;
			const next = rows.filter((row) => row.id !== projectId);
			if (next.length !== rows.length) {
				saveHostProjectsSnapshot(organizationId, machineId, next);
			}
		},
	);
	snapshotWriteChains.set(
		key,
		chained.catch(() => {}),
	);
	return chained;
}

/**
 * Apply a project:changed event to a host's cached list. Created/updated
 * upsert from the event's snapshot payload; deleted removes the row.
 */
export function applyProjectChangedEvent(
	rows: HostProjectRow[] | undefined,
	event: {
		eventType: "created" | "updated" | "deleted";
		project: ProjectSnapshotPayload | null;
	},
	projectId: string,
): HostProjectRow[] | undefined {
	if (event.eventType === "deleted") {
		if (!rows) return rows;
		const next = rows.filter((row) => row.id !== projectId);
		return next.length === rows.length ? rows : next;
	}
	const snapshot = event.project;
	if (!snapshot) return rows;
	const existing = rows?.find((row) => row.id === snapshot.id);
	const nextRow: HostProjectRow = {
		id: snapshot.id,
		name: snapshot.name,
		repoPath: snapshot.repoPath,
		repoOwner: snapshot.repoOwner,
		repoName: snapshot.repoName,
		repoUrl: snapshot.repoUrl,
		worktreeBaseDir: snapshot.worktreeBaseDir,
		createdAt: snapshot.createdAt,
		updatedAt: snapshot.updatedAt,
	};
	if (!rows) return [nextRow];
	return existing
		? rows.map((row) => (row.id === nextRow.id ? nextRow : row))
		: [...rows, nextRow];
}

/**
 * Per-row union merge across hosts on `id`. Legacy cloud-created projects
 * share an id across machines, so their replicas collapse into one item;
 * the most recently updated replica wins shared fields and the local
 * host's replica wins `id`/`repoPath` for open/navigate actions.
 */
export function mergeHostProjects({
	hostResults,
}: {
	hostResults: Array<{
		target: HostProjectsQueryTarget;
		rows: HostProjectRow[] | undefined;
		reachable: boolean;
	}>;
}): HostProjectItem[] {
	const byKey = new Map<string, HostProjectItem>();

	for (const result of hostResults) {
		if (!result.rows) continue;
		for (const row of result.rows) {
			const key = row.id;
			const existing = byKey.get(key);
			if (!existing) {
				byKey.set(key, {
					projectKey: key,
					id: row.id,
					name: row.name,
					repoPath: row.repoPath,
					repoOwner: row.repoOwner,
					repoName: row.repoName,
					repoUrl: row.repoUrl,
					hostIds: [result.target.machineId],
					hostReachable: result.reachable,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt,
				});
				continue;
			}
			existing.hostIds.push(result.target.machineId);
			existing.hostReachable = existing.hostReachable || result.reachable;
			// Most recently updated replica wins the shared fields.
			if (row.updatedAt > existing.updatedAt) {
				existing.name = row.name;
				existing.repoUrl = row.repoUrl;
				existing.updatedAt = row.updatedAt;
			}
			if (row.createdAt < existing.createdAt) {
				existing.createdAt = row.createdAt;
			}
			// Prefer the local host's repoPath for open/navigate actions.
			if (result.target.isLocal) {
				existing.repoPath = row.repoPath;
				existing.repoOwner = row.repoOwner;
				existing.repoName = row.repoName;
			}
		}
	}

	return Array.from(byKey.values());
}
