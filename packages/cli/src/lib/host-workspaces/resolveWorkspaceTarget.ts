import { CLIError } from "@superset/cli-framework";
import { resolveWorkspaceHost } from "../cloud-workspaces";
import {
	type ResolvedHostTarget,
	resolveCloudWorkspaceTarget,
	resolveHostTarget,
} from "../host-target";
import {
	type HostWorkspaceRow,
	type HostWorkspacesOptions,
	listWorkspacesOnHost,
} from "./workspacesOnHost";

export interface ResolvedWorkspaceTarget {
	hostId: string;
	workspace: HostWorkspaceRow;
	target: ResolvedHostTarget;
}

/**
 * Where a workspace lives and a client for it: `--local` or `--host` names a
 * host; otherwise the account's default location (see resolveWorkspaceHost).
 * Never guessed from the id.
 */
export async function resolveWorkspaceTarget(
	options: Omit<HostWorkspacesOptions, "hostId"> & {
		host?: string;
		local?: boolean;
	},
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const hostId = await resolveWorkspaceHost(
		{ host: options.host, local: options.local },
		options.api,
		options.organizationId,
	);
	return hostId
		? onHost(options, hostId, workspaceId)
		: inCloud(options, workspaceId);
}

async function onHost(
	options: Omit<HostWorkspacesOptions, "hostId">,
	hostId: string,
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const { workspaces } = await listWorkspacesOnHost({ ...options, hostId });
	const workspace = workspaces.find((row) => row.id === workspaceId);
	if (!workspace) {
		throw new CLIError(
			`Workspace not found on host ${hostId}: ${workspaceId}`,
			"Pass --host <id> if it lives on another machine",
		);
	}
	const target = await resolveHostTarget({
		requestedHostId: hostId,
		organizationId: options.organizationId,
		userJwt: options.userJwt,
		api: options.api,
	});
	return { hostId, workspace, target };
}

async function inCloud(
	options: Omit<HostWorkspacesOptions, "hostId">,
	workspaceId: string,
): Promise<ResolvedWorkspaceTarget> {
	const { target, workspaces } = await resolveCloudWorkspaceTarget({
		api: options.api,
		organizationId: options.organizationId,
		workspaceId,
	});
	const workspace = workspaces.find(
		(candidate) => candidate.id === workspaceId,
	);
	if (!workspace) {
		throw new CLIError(
			`Cloud workspace ${workspaceId} has not finished setting up`,
			"Its checkout is still arriving; try again shortly",
		);
	}
	return {
		hostId: workspace.hostId,
		workspace,
		target: { ...target, hostId: workspace.hostId },
	};
}
