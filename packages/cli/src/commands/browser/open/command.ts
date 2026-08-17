import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "Open a URL in a workspace browser pane and return its pane id",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		url: string().required().desc("URL to open"),
		target: string().desc("`current-tab` (default) or `new-tab`"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		// Reject typos rather than silently falling back to current-tab.
		if (
			options.target &&
			!["current-tab", "new-tab"].includes(options.target)
		) {
			throw new CLIError(
				`Invalid --target: ${options.target}`,
				"Use `current-tab` or `new-tab`",
			);
		}
		const target = options.target === "new-tab" ? "new-tab" : "current-tab";
		const result = await client.browser.open.mutate({
			workspaceId: options.workspace,
			url: options.url,
			target,
		});
		return {
			data: result,
			message: `Opened ${result.url}\npane: ${result.paneId}`,
		};
	},
});
