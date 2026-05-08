import { exec } from "node:child_process";
import { boolean, CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function openUrl(url: string): void {
	switch (process.platform) {
		case "darwin":
			exec(`open "${url}"`);
			break;
		case "win32":
			exec(`start "" "${url}"`);
			break;
		default:
			exec(`xdg-open "${url}"`);
	}
}

export default command({
	description: "Open a workspace in the Superset desktop app",
	args: [positional("workspace").required().desc("Workspace ID or exact name")],
	options: {
		print: boolean().desc(
			"Print the deep link URL instead of opening the desktop app",
		),
	},
	run: async ({ ctx, args, options }) => {
		const query = args.workspace as string;
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		let id: string;
		let name: string;
		if (UUID_RE.test(query)) {
			const found = await ctx.api.v2Workspace.getFromHost.query({
				organizationId,
				id: query,
			});
			if (!found) {
				throw new CLIError(`Workspace not found: ${query}`);
			}
			id = found.id;
			name = found.name;
		} else {
			const workspaces = await ctx.api.v2Workspace.list.query({
				organizationId,
			});
			const matches = workspaces.filter((w) => w.name === query);
			if (matches.length === 0) {
				throw new CLIError(
					`No workspace matched: ${query}`,
					"Pass a workspace ID or exact name. List options with: superset workspaces list",
				);
			}
			if (matches.length > 1) {
				throw new CLIError(
					`Multiple workspaces named "${query}"`,
					`Pass the workspace ID instead. Matches: ${matches.map((w) => w.id).join(", ")}`,
				);
			}
			id = matches[0]!.id;
			name = matches[0]!.name;
		}

		const url = `superset://v2-workspace/${id}`;
		const printOnly = options.print ?? !process.stdout.isTTY;

		if (!printOnly) {
			openUrl(url);
		}

		return {
			data: { id, name, url },
			message: printOnly ? url : `Opening "${name}" in Superset desktop`,
		};
	},
});
