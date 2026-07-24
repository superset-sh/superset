import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

export default command({
	description: "Create a terminal session in an existing workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		command: string().desc(
			"Shell command to run in the terminal. Omit to open an interactive shell",
		),
		cwd: string().desc(
			"Working directory for the terminal (defaults to the worktree)",
		),
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

		const result = await target.client.terminal.createSession.mutate({
			workspaceId: options.workspace,
			initialCommand: options.command ?? undefined,
			cwd: options.cwd ?? undefined,
		});

		return {
			data: result,
			message: `Created terminal ${result.terminalId} in workspace ${options.workspace}`,
		};
	},
});
