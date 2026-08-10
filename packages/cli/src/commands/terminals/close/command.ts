import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "Close (dispose) a terminal running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		terminal: string().required().desc("Terminal ID to close"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const hostId = options.host ?? getHostId();
		const { workspace } = await findWorkspaceOnHost(
			{ organizationId, userJwt: ctx.bearer, hostId },
			options.workspace,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${options.workspace}`,
				"Pass --host <id> if it lives on another machine",
			);
		}

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const result = await target.client.terminal.killSession.mutate({
			terminalId: options.terminal,
			workspaceId: options.workspace,
		});

		return {
			data: result,
			message: `Closed terminal ${options.terminal}`,
		};
	},
});
