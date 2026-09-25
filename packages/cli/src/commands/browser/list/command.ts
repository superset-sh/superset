import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "List the browser panes open in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		const { panes } = await client.browser.list.query({
			workspaceId: options.workspace,
		});
		return {
			data: panes,
			message: panes.length
				? panes.map((p) => `${p.paneId}\t${p.url}\t${p.title}`).join("\n")
				: "No browser panes open in this workspace.",
		};
	},
});
