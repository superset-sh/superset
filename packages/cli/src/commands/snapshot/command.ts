import { string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import { buildSnapshot, formatSnapshot } from "../../lib/host-snapshot";
import { resolveHostClient } from "../../lib/resolve-host-client";

export default command({
	description:
		"One view of a host: every workspace, its terminals, the agent in each and its state, and the pane layout",
	options: {
		host: string().desc("Host to read (default: this machine)"),
		workspace: string().desc("Only this workspace"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const [allWorkspaces, { sessions }, agents] = await Promise.all([
			client.workspace.list.query(),
			client.terminal.list.query(
				options.workspace ? { workspaceId: options.workspace } : undefined,
			),
			client.terminalAgents.list.query(),
		]);
		const workspaces = options.workspace
			? allWorkspaces.filter((workspace) => workspace.id === options.workspace)
			: allWorkspaces;
		// The layout lives in the desktop app; without one attached, or on a host
		// that predates `panes`, a workspace just has no layout here.
		const layouts = new Map(
			await Promise.all(
				workspaces.map(
					async (workspace) =>
						[
							workspace.id,
							await client.panes.list
								.query({ workspaceId: workspace.id })
								.then((result) => result.layout)
								.catch(() => null),
						] as const,
				),
			),
		);
		const snapshot = buildSnapshot({
			workspaces,
			terminals: sessions,
			agents,
			layouts,
		});
		return {
			data: { workspaces: snapshot },
			message: formatSnapshot(snapshot),
		};
	},
});
