import { CLIError } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import type { ApiClient } from "../../lib/api-client";
import { checkLocalHostHealth, type HostHealth } from "../../lib/host/health";
import { resolveHostTarget } from "../../lib/host-target";
import { findWorkspaceOnHost } from "../../lib/host-workspaces";

/**
 * The cloud scheduler routes a run by the `targetHostId` + `v2ProjectId`
 * stored on the automation row — it cannot see host-owned data. The
 * workspace or project must exist on the target host (`--host`, else this
 * machine). No workspace and no project = session mode: each run creates a
 * project-less session workspace.
 */
export async function resolveAutomationTarget(args: {
	organizationId: string;
	userJwt: string;
	api: ApiClient;
	hostId?: string;
	workspaceId?: string;
	projectId?: string;
	/** Health of this machine's host-service; injectable for tests. */
	checkLocalHost?: (organizationId: string) => Promise<HostHealth | null>;
}): Promise<{ targetHostId: string; v2ProjectId: string | null }> {
	const targetHostId = args.hostId ?? getHostId();
	const checkLocalHost = args.checkLocalHost ?? checkLocalHostHealth;

	// The cloud rejects automations whose target host has no v2Hosts row
	// (the host-service registers one at startup, and that registration can
	// fail silently — issue #6415). Catch it here, where the user can act
	// on it, instead of surfacing a bare 404 from the API. This guards
	// every mode, including session mode, which needs no other cloud data.
	const hosts = await args.api.host.list.query({
		organizationId: args.organizationId,
	});
	if (!hosts.some((host) => host.id === targetHostId)) {
		throw new CLIError(
			args.hostId
				? `Host ${targetHostId} is not registered in this organization`
				: `This machine (host ${targetHostId}) isn't registered with the cloud`,
			args.hostId
				? "Run: superset hosts list"
				: "Restart the host service (superset stop && superset start), then check: superset hosts list",
		);
	}

	// Runs dispatch through the relay, so a registered host with Remote
	// Access off would accept the automation and then skip every run as
	// offline. Only this machine's host-service can tell that apart from a
	// transient disconnect, so ask it (#7223).
	if (!args.hostId) {
		const local = await checkLocalHost(args.organizationId);
		if (local?.relayEnabled === false) {
			throw new CLIError(
				"Remote Access is off for this machine, so automations can't run on it",
				"Turn it on in the Superset app under Settings → Remote Access, then retry",
			);
		}
	}

	if (args.workspaceId) {
		const { workspace } = await findWorkspaceOnHost(
			{
				organizationId: args.organizationId,
				userJwt: args.userJwt,
				api: args.api,
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
				workspace.projectId === null
					? `Workspace ${args.workspaceId} is a session (no project)`
					: `Workspace ${args.workspaceId} belongs to project ${workspace.projectId}`,
			);
		}
		return { targetHostId, v2ProjectId: workspace.projectId };
	}

	if (!args.projectId) {
		// Session mode: the host verifies nothing project-side; runs call
		// workspaces.createSession.
		return { targetHostId, v2ProjectId: null };
	}
	const target = await resolveHostTarget({
		requestedHostId: targetHostId,
		organizationId: args.organizationId,
		userJwt: args.userJwt,
		api: args.api,
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
