import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { CliContext } from "../../../../../lib/command";
import {
	type HostServiceClient,
	resolveHostFilter,
	resolveHostTarget,
} from "../../../../../lib/host-target";
import { resolveWorkspaceTarget } from "../../../../../lib/host-workspaces";
import { findWorkspaceForPath } from "../findWorkspaceForPath";

export interface FilesTarget {
	workspaceId: string;
	hostId: string;
	client: HostServiceClient;
}

/**
 * The workspace to open files in and a client for its host. An explicit
 * `--workspace` resolves like every other workspace command; without one the
 * workspace is the one whose worktree contains `cwd` on this machine (or on
 * `--host`), falling back to $SUPERSET_WORKSPACE_ID for a Superset terminal
 * that has left its worktree.
 */
export async function resolveFilesTarget(
	ctx: CliContext,
	options: { workspace?: string; host?: string; local?: boolean },
	cwd: string,
): Promise<FilesTarget> {
	const organizationId = ctx.config.organizationId;
	if (!organizationId) {
		throw new CLIError("No active organization", "Run: superset auth login");
	}
	const shared = { organizationId, userJwt: ctx.bearer, api: ctx.api };

	if (options.workspace) {
		const { hostId, target } = await resolveWorkspaceTarget(
			{ ...shared, host: options.host, local: options.local },
			options.workspace,
		);
		return { workspaceId: options.workspace, hostId, client: target.client };
	}

	const hostId =
		resolveHostFilter({ host: options.host, local: options.local }) ??
		getHostId();
	const target = await resolveHostTarget({
		...shared,
		requestedHostId: hostId,
	});
	const workspaces = await target.client.workspace.list.query();
	const envWorkspaceId = process.env.SUPERSET_WORKSPACE_ID;
	const workspace =
		findWorkspaceForPath(workspaces, cwd) ??
		workspaces.find((row) => envWorkspaceId && row.id === envWorkspaceId);
	if (!workspace) {
		throw new CLIError(
			`No workspace on host ${hostId} contains ${cwd}`,
			"Run from inside a workspace's worktree, or pass --workspace <id> (see `superset ws list --local`)",
		);
	}
	return { workspaceId: workspace.id, hostId, client: target.client };
}
