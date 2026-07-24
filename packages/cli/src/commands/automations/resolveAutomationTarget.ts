import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { resolveHostTarget } from "../../lib/host-target";
import { findWorkspaceOnHost } from "../../lib/host-workspaces";

/**
 * The cloud scheduler routes a run by the `targetHostId` + `v2ProjectId`
 * stored on the automation row — it cannot see host-owned data. The
 * workspace or project must exist on the target host (`--host`, else this
 * machine).
 */
export async function resolveAutomationTarget(args: {
	organizationId: string;
	userJwt: string;
	hostId?: string;
	workspaceId?: string;
	projectId?: string;
}): Promise<{ targetHostId: string; v2ProjectId: string }> {
	const targetHostId = args.hostId ?? getHostId();

	if (args.workspaceId) {
		const { workspace } = await findWorkspaceOnHost(
			{
				organizationId: args.organizationId,
				userJwt: args.userJwt,
				hostId: targetHostId,
			},
			args.workspaceId,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${targetHostId}: ${args.workspaceId}`,
				"Pass --host <id> if it lives on another machine",
			);
		}
		if (args.projectId && args.projectId !== workspace.projectId) {
			throw new CLIError(
				"--project does not match the workspace's project",
				`Workspace ${args.workspaceId} belongs to project ${workspace.projectId}`,
			);
		}
		return { targetHostId, v2ProjectId: workspace.projectId };
	}

	if (!args.projectId) {
		throw new CLIError("Provide --project or --workspace");
	}
	const target = resolveHostTarget({
		requestedHostId: targetHostId,
		organizationId: args.organizationId,
		userJwt: args.userJwt,
	});
	const projects = await target.client.project.list.query();
	if (!projects.some((project) => project.id === args.projectId)) {
		throw new CLIError(
			`Project ${args.projectId} is not set up on host ${targetHostId}`,
			"Run: superset projects list",
		);
	}
	return { targetHostId, v2ProjectId: args.projectId };
}
