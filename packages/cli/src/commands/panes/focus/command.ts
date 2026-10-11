import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import { callPanes, layoutResult, workspaceOptions } from "../shared";

export default command({
	description: "Make a pane and its tab the active ones",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane ID"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.focus.mutate({
				workspaceId: options.workspace,
				paneId: options.pane,
			}),
		);
		return layoutResult(`Focused ${options.pane}`, result);
	},
});
