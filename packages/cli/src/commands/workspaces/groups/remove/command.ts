import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import {
	resolveHostFilter,
	resolveHostTarget,
} from "../../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../../lib/host-workspaces";

export default command({
	description: "Move a workspace out of its group (default host: this machine)",
	args: [positional("workspaceId").required().desc("Workspace UUID")],
	options: {
		host: string().desc("Host the workspace lives on"),
		local: boolean().desc("Target this machine (the default)"),
	},
	run: async ({ ctx, args, options }) => {
		const workspaceId = args.workspaceId as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { hostId, workspace } = await findWorkspaceOnHost(
			{
				organizationId,
				userJwt: ctx.bearer,
				hostId: resolveHostFilter({
					host: options.host ?? undefined,
					local: options.local ?? undefined,
				}),
			},
			workspaceId,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${workspaceId}`,
				"Pass --host <id> if it lives on another machine. List with: superset workspaces list",
			);
		}
		if (!workspace.sectionId) {
			return {
				data: workspace,
				message: `Workspace "${workspace.name}" is not in a group`,
			};
		}

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});
		const updated = await target.client.sections.moveWorkspace.mutate({
			workspaceId,
			sectionId: null,
		});

		return {
			data: updated,
			message: `Moved workspace "${workspace.name}" out of its group`,
		};
	},
});
