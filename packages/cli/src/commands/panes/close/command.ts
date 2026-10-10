import { boolean, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import { callPanes, layoutResult, workspaceOptions } from "../shared";

export default command({
	description:
		"Close a pane and end its terminal, or keep the terminal running in the background",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane ID"),
		keepTerminal: boolean().desc(
			"Keep the terminal running in the background instead of ending it",
		),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.close.mutate({
				workspaceId: options.workspace,
				paneId: options.pane,
				keepTerminal: options.keepTerminal ?? false,
			}),
		);
		const ended =
			result.terminalId && !options.keepTerminal
				? `; ended terminal ${result.terminalId}`
				: "";
		return layoutResult(`Closed ${options.pane}${ended}`, result);
	},
});
