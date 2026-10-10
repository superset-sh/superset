import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	callPanes,
	layoutResult,
	resolvePanesClient,
	workspaceOptions,
} from "../shared";

export default command({
	description: "Close a pane. Its terminal session keeps running",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane ID"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolvePanesClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.close.mutate({
				workspaceId: options.workspace,
				paneId: options.pane,
			}),
		);
		return layoutResult(`Closed ${options.pane}`, result);
	},
});
