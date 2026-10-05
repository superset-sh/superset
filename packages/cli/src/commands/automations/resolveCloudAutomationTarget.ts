import { CLIError } from "@superset/cli-framework";
import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import type { ApiClient } from "../../lib/api-client";
import { resolveCloudEnvironment } from "../../lib/cloud-workspaces";

/** The flags a cloud automation cannot take, by name, from what was parsed. */
export function refuseHostFlagsForCloud(flags: Record<string, unknown>): void {
	for (const [flag, value] of Object.entries(flags)) {
		if (value !== undefined && value !== false) {
			throw new CLIError(
				`${flag} does not apply to a cloud automation`,
				"A cloud automation runs in a cloud workspace started from --environment, or pinned with --workspace <cloud workspace id>",
			);
		}
	}
}

/** A pinned cloud workspace, or an environment chosen as a workspace create chooses one. */
export async function resolveCloudAutomationTarget(args: {
	api: ApiClient;
	organizationId: string;
	environment?: string;
	workspaceId?: string;
	requirePlacement: boolean;
}): Promise<{
	target: {
		targetHostId: string;
		environmentId?: string;
		cloudWorkspaceId?: string;
	};
	/** Where runs go, for the confirmation line. */
	placement: string;
}> {
	if (!args.environment && !args.workspaceId && !args.requirePlacement) {
		return {
			target: { targetHostId: CLOUD_HOST_ID },
			placement: "in the cloud",
		};
	}
	if (!args.environment && args.workspaceId) {
		return {
			target: {
				targetHostId: CLOUD_HOST_ID,
				cloudWorkspaceId: args.workspaceId,
			},
			placement: `in cloud workspace ${args.workspaceId}`,
		};
	}
	const environments = await args.api.environment.list.query({
		organizationId: args.organizationId,
	});
	const environment = resolveCloudEnvironment(environments, args.environment);
	return {
		target: {
			targetHostId: CLOUD_HOST_ID,
			environmentId: environment.id,
			...(args.workspaceId ? { cloudWorkspaceId: args.workspaceId } : {}),
		},
		placement: args.workspaceId
			? `in cloud workspace ${args.workspaceId}`
			: `in a new cloud workspace from environment "${environment.name}" each run`,
	};
}
