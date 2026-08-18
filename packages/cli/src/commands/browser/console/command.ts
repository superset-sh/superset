import { CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "Read a browser pane's captured console output",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
		maxLines: number().int().desc("Cap returned entries from the bottom"),
	},
	run: async ({ ctx, options }) => {
		if (options.maxLines != null && options.maxLines < 0) {
			throw new CLIError("--max-lines must be >= 0");
		}
		const { client } = await resolveBrowserTarget(ctx, options);
		const { entries } = await client.browser.console.query({
			workspaceId: options.workspace,
			paneId: options.pane,
		});
		// `!= null` so `--max-lines 0` means zero, not "all".
		const limited =
			options.maxLines != null
				? entries.slice(entries.length - options.maxLines)
				: entries;
		return {
			data: limited,
			message: limited.length
				? limited.map((e) => `[${e.level}] ${e.message}`).join("\n")
				: "No console output captured.",
		};
	},
});
