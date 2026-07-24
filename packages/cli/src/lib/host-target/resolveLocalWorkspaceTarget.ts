import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { isProcessAlive, listManifests } from "../host/manifest";
import {
	createLocalHostServiceClient,
	type HostServiceClient,
} from "./resolveHostTarget";

type HostWorkspaceRow = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>[number];

export interface ResolvedLocalWorkspaceTarget {
	hostId: string;
	client: HostServiceClient;
	workspace: HostWorkspaceRow;
}

/**
 * Resolve a workspace against a host service running as the current OS user.
 *
 * Agent terminals already have access to the host manifests in
 * SUPERSET_HOME_DIR. Using the manifest's loopback endpoint and per-process
 * token keeps delegated workspace creation independent of cloud/MCP login
 * state while retaining the host service as the single mutation boundary.
 */
export async function resolveLocalWorkspaceTarget(
	workspaceId: string,
): Promise<ResolvedLocalWorkspaceTarget> {
	const hostId = getHostId();
	const manifests = listManifests().filter((manifest) =>
		isProcessAlive(manifest.pid),
	);

	for (const manifest of manifests) {
		const client = createLocalHostServiceClient(manifest, hostId);
		try {
			const workspaces = await client.workspace.list.query();
			const workspace = workspaces.find((row) => row.id === workspaceId);
			if (workspace) return { hostId, client, workspace };
		} catch {
			// Another organization may have a stale endpoint despite a live PID.
			// Continue until the owning host service is found.
		}
	}

	throw new CLIError(
		`Workspace not found on a running local host: ${workspaceId}`,
		"Run this command inside the Superset workspace that owns the agent session.",
	);
}
