import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../lib/command";
import {
	buildSnapshot,
	formatSnapshot,
	type LayoutRead,
} from "../../lib/host-snapshot";
import type { HostServiceClient } from "../../lib/host-target";
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
		if (options.workspace && workspaces.length === 0) {
			throw new CLIError(
				`Workspace ${options.workspace} is not on this host`,
				"List them with `superset workspaces list`, or pass --host",
			);
		}
		const layouts = new Map(
			await Promise.all(
				workspaces.map(
					async (workspace) =>
						[workspace.id, await readLayout(client, workspace.id)] as const,
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

/**
 * No desktop app attached, or a host that predates `panes`, means there is no
 * layout to show. Any other failure is reported, not hidden as "no desktop".
 */
async function readLayout(
	client: HostServiceClient,
	workspaceId: string,
): Promise<LayoutRead> {
	try {
		return { layout: (await client.panes.list.query({ workspaceId })).layout };
	} catch (error) {
		const code = (error as { data?: { code?: string } } | null)?.data?.code;
		const message = error instanceof Error ? error.message : String(error);
		if (
			code === "PRECONDITION_FAILED" ||
			/No procedure found on path "?panes\./.test(message)
		) {
			return { layout: null };
		}
		return { error: message };
	}
}
