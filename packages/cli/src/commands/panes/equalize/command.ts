import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import { callPanes, layoutResult, workspaceOptions } from "../shared";

export default command({
	description: "Give the panes in a tab equal space (every tab by default)",
	options: {
		...workspaceOptions,
		tab: string().desc("Only equalize this tab"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.equalize.mutate({
				workspaceId: options.workspace,
				tabId: options.tab ?? undefined,
			}),
		);
		return layoutResult(
			options.tab ? `Equalized tab ${options.tab}` : "Equalized every tab",
			result,
		);
	},
});
