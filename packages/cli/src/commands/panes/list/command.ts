import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import { callPanes, formatLayout, workspaceOptions } from "../shared";

export default command({
	description:
		"List the tabs of a workspace and the split tree of panes in each tab",
	options: workspaceOptions,
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const { layout } = await callPanes(() =>
			client.panes.list.query({ workspaceId: options.workspace }),
		);
		return { data: layout, message: formatLayout(layout) };
	},
});
