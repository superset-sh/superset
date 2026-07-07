import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List the live terminal sessions in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const cloudWorkspace = await ctx.api.v2Workspace.getFromHost.query({
			organizationId,
			id: options.workspace,
		});
		if (!cloudWorkspace) {
			throw new CLIError(`Workspace not found: ${options.workspace}`);
		}

		const target = resolveHostTarget({
			requestedHostId: cloudWorkspace.hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const result = await target.client.terminal.listSessions.query({
			workspaceId: options.workspace,
		});

		return {
			data: result,
			message: `${result.sessions.length} terminal(s) in workspace ${options.workspace}`,
		};
	},
});
