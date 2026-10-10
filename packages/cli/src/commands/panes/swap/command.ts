import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	callPanes,
	layoutResult,
	resolvePanesClient,
	workspaceOptions,
} from "../shared";

export default command({
	description: "Swap the places of two panes, in the same tab or across tabs",
	options: {
		...workspaceOptions,
		pane: string().required().desc("First pane"),
		with: string().required().desc("Second pane"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolvePanesClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.swap.mutate({
				workspaceId: options.workspace,
				paneId: options.pane,
				withPaneId: options.with,
			}),
		);
		return layoutResult(`Swapped ${options.pane} and ${options.with}`, result);
	},
});
