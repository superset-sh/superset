import { spawn } from "node:child_process";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

function openUrl(url: string): Promise<void> {
	const [bin, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["cmd", ["/c", "start", "", url]]
				: ["xdg-open", [url]];

	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: "ignore", detached: true });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}

export default command({
	description: "Open a workspace in the Superset desktop app",
	args: [positional("id").required().desc("Workspace ID")],
	options: {
		host: string().desc("Host the workspace lives on (default: this machine)"),
		print: boolean().desc(
			"Print the deep link URL instead of opening the desktop app",
		),
	},
	run: async ({ ctx, args, options }) => {
		const id = args.id as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { hostId, workspace } = await findWorkspaceOnHost(
			{
				organizationId,
				userJwt: ctx.bearer,
				hostId: options.host ?? undefined,
			},
			id,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${id}`,
				"Pass --host <id> if it lives on another machine. List with: superset workspaces list",
			);
		}

		const url = `superset://v2-workspace/${workspace.id}`;

		if (!options.print) {
			try {
				await openUrl(url);
			} catch (err) {
				throw new CLIError(
					"Failed to open desktop app",
					err instanceof Error ? err.message : String(err),
				);
			}
		}

		return {
			data: { id: workspace.id, name: workspace.name, url },
			message: options.print
				? url
				: `Opening "${workspace.name}" in Superset desktop`,
		};
	},
});
