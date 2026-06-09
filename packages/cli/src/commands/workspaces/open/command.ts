import { spawn } from "node:child_process";
import { boolean, CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

interface OpenUrlSpawn {
	command: string;
	args: string[];
	windowsVerbatimArguments?: boolean;
}

function cmdDoubleQuote(value: string): string {
	return `"${value.replaceAll('"', '""').replaceAll("\r", "").replaceAll("\n", "")}"`;
}

export function buildOpenUrlSpawn(
	url: string,
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): OpenUrlSpawn {
	if (platform === "darwin") {
		return { command: "open", args: [url] };
	}
	if (platform === "win32") {
		return {
			command: env.COMSPEC || env.ComSpec || "cmd.exe",
			args: ["/d", "/s", "/c", `start "" ${cmdDoubleQuote(url)}`],
			windowsVerbatimArguments: true,
		};
	}
	return { command: "xdg-open", args: [url] };
}

function openUrl(url: string): Promise<void> {
	const launch = buildOpenUrlSpawn(url);

	return new Promise((resolve, reject) => {
		const child = spawn(launch.command, launch.args, {
			stdio: "ignore",
			detached: true,
			windowsVerbatimArguments: launch.windowsVerbatimArguments,
		});
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

		const workspace = await ctx.api.v2Workspace.getFromHost.query({
			organizationId,
			id,
		});
		if (!workspace) {
			throw new CLIError(
				`Workspace not found: ${id}`,
				"List workspaces with: superset workspaces list",
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
