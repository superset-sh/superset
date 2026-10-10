import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import {
	directionOption,
	layoutResult,
	terminalOptions,
	withPaneTerminal,
	workspaceOptions,
} from "../shared";

export default command({
	description:
		"Split a pane and show a terminal in the new pane. Creates a terminal unless --terminal is set",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane to split"),
		direction: directionOption().required(),
		...terminalOptions,
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await withPaneTerminal(
			client,
			options.workspace,
			options,
			(terminalId) =>
				client.panes.split.mutate({
					workspaceId: options.workspace,
					paneId: options.pane,
					direction: options.direction,
					terminalId,
				}),
		);
		return layoutResult(
			`Split ${options.pane} ${options.direction}: pane ${result.paneId}, terminal ${result.terminalId}`,
			result,
		);
	},
});
