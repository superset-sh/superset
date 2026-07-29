import { getHostId } from "@superset/shared/host-info";
import { type HostServiceClient, resolveHostTarget } from "../host-target";

export type HostWorkspaceRow = Awaited<
	ReturnType<HostServiceClient["workspace"]["list"]["query"]>
>[number];

export interface HostWorkspacesOptions {
	organizationId: string;
	userJwt: string;
	/** Explicit host; defaults to this machine. */
	hostId?: string;
}

/**
 * Workspace reads are single-host by design: `--host` when given, else this
 * machine. There is no org-wide fan-out — the desktop is the cross-host view.
 */
export async function listWorkspacesOnHost(
	options: HostWorkspacesOptions,
): Promise<{ hostId: string; workspaces: HostWorkspaceRow[] }> {
	const hostId = options.hostId ?? getHostId();
	const target = resolveHostTarget({
		requestedHostId: hostId,
		organizationId: options.organizationId,
		userJwt: options.userJwt,
	});
	return { hostId, workspaces: await target.client.workspace.list.query() };
}

export async function findWorkspaceOnHost(
	options: HostWorkspacesOptions,
	workspaceId: string,
): Promise<{ hostId: string; workspace: HostWorkspaceRow | undefined }> {
	const { hostId, workspaces } = await listWorkspacesOnHost(options);
	return {
		hostId,
		workspace: workspaces.find((workspace) => workspace.id === workspaceId),
	};
}
