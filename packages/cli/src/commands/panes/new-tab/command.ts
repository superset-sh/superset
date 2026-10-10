import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import {
	layoutResult,
	terminalOptions,
	withPaneTerminal,
	workspaceOptions,
} from "../shared";

export default command({
	description:
		"Open a new tab with a terminal pane. Creates a terminal unless --terminal is set",
	options: { ...workspaceOptions, ...terminalOptions },
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await withPaneTerminal(
			client,
			options.workspace,
			options,
			(terminalId) =>
				client.panes.newTab.mutate({
					workspaceId: options.workspace,
					terminalId,
				}),
		);
		return layoutResult(
			`New tab ${result.tabId}: pane ${result.paneId}, terminal ${result.terminalId}`,
			result,
		);
	},
});
