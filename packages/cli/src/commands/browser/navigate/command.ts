import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "Navigate an existing browser pane to a URL",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
		url: string().required().desc("URL to navigate to"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		await client.browser.navigate.mutate({
			workspaceId: options.workspace,
			paneId: options.pane,
			url: options.url,
		});
		return { data: { ok: true }, message: `Navigated ${options.pane}` };
	},
});
