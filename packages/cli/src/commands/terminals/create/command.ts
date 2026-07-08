import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findHostWorkspace } from "../../../lib/host-workspaces";

export default command({
	description: "Create a terminal session in an existing workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
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

		// Workspace records are host-owned: resolve the id across the org's
		// reachable hosts.
		const { workspace, warnings } = await findHostWorkspace(
			{ api: ctx.api, organizationId, userJwt: ctx.bearer },
			options.workspace,
		);
		for (const warning of warnings) {
			process.stderr.write(`Warning: ${warning}\n`);
		}
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on any reachable host: ${options.workspace}`,
			);
		}

		const target = resolveHostTarget({
			requestedHostId: workspace.hostId,
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
