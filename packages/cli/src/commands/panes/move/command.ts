import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	callPanes,
	directionOption,
	layoutResult,
	resolvePanesClient,
	workspaceOptions,
} from "../shared";

export default command({
	description:
		"Move a pane next to another pane (--to and --direction) or into a new tab (--new-tab)",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane to move"),
		to: string().desc("Pane to place it next to"),
		direction: directionOption(),
		newTab: boolean().desc("Move the pane into a new tab of its own"),
	},
	run: async ({ ctx, options }) => {
		const workspaceId = options.workspace;
		const paneId = options.pane;
		if (options.newTab) {
			if (options.to || options.direction) {
				throw new CLIError("--new-tab cannot be used with --to or --direction");
			}
			const client = await resolvePanesClient(ctx, options);
			const result = await callPanes(() =>
				client.panes.moveToNewTab.mutate({ workspaceId, paneId }),
			);
			return layoutResult(`Moved ${paneId} to new tab ${result.tabId}`, result);
		}

		const { to, direction } = options;
		if (!to || !direction) {
			throw new CLIError(
				"Say where to move the pane",
				"Pass --to PANE --direction right|left|down|up, or --new-tab",
			);
		}
		const client = await resolvePanesClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.move.mutate({
				workspaceId,
				paneId,
				targetPaneId: to,
				direction,
			}),
		);
		return layoutResult(`Moved ${paneId} ${direction} of ${to}`, result);
	},
});
