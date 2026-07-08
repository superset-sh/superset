import type { Superset } from "../client";
import { SupersetError } from "../core/error";

/** Cloud-shaped workspace row served by a host's `workspace.list`. */
export interface HostWorkspaceRow {
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
	/** Absolute worktree path on the host filesystem. */
	worktreePath: string;
	worktreeExists: boolean;
}

/**
 * Workspace records are host-owned: discover the org's hosts via the cloud
 * (`host.list` stays cloud-owned), then query each online host's
 * `workspace.list` through the relay and merge. Hosts that fail to answer
 * are skipped, so results reflect reachable hosts only.
 */
export async function listHostWorkspaces(
	client: Superset,
	organizationId: string,
	hostId?: string,
): Promise<HostWorkspaceRow[]> {
	let hostIds: string[];
	if (hostId) {
		hostIds = [hostId];
	} else {
		const hosts = await client.query<Array<{ id: string; online: boolean }>>(
			"host.list",
			{ organizationId },
		);
		hostIds = hosts.filter((host) => host.online).map((host) => host.id);
	}
	const settled = await Promise.allSettled(
		hostIds.map((id) =>
			client.hostQuery<HostWorkspaceRow[]>(id, "workspace.list"),
		),
	);
	return settled.flatMap((result) =>
		result.status === "fulfilled" ? result.value : [],
	);
}

/**
 * Resolve the host that owns a workspace by fanning out across the org's
 * reachable hosts. Throws when no reachable host knows the id.
 */
export async function findWorkspaceHostId(
	client: Superset,
	organizationId: string,
	workspaceId: string,
): Promise<string> {
	const workspaces = await listHostWorkspaces(client, organizationId);
	const workspace = workspaces.find((row) => row.id === workspaceId);
	if (!workspace) {
		throw new SupersetError(
			`Workspace not found on any reachable host: ${workspaceId}`,
		);
	}
	return workspace.hostId;
}
