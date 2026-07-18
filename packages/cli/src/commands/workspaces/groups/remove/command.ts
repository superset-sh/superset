import { CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { resolveHostTarget } from "../../../../lib/host-target";
import { findHostWorkspace } from "../../../../lib/host-workspaces";

export default command({
	description: "Move a workspace out of its group",
	args: [positional("workspaceId").required().desc("Workspace UUID")],
	run: async ({ ctx, args }) => {
		const workspaceId = args.workspaceId as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { workspace, warnings } = await findHostWorkspace(
			{ api: ctx.api, organizationId, userJwt: ctx.bearer },
			workspaceId,
		);
		for (const warning of warnings) {
			process.stderr.write(`Warning: ${warning}\n`);
		}
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on any reachable host: ${workspaceId}`,
				"List workspaces with: superset workspaces list",
			);
		}
		if (!workspace.sectionId) {
			return {
				data: workspace,
				message: `Workspace "${workspace.name}" is not in a group`,
			};
		}

		const target = resolveHostTarget({
			requestedHostId: workspace.hostId,
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
