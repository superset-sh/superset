import { number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostClient } from "../../../lib/resolve-host-client";
import { callPanes, layoutResult, workspaceOptions } from "../shared";

export default command({
	description: "Open a workspace file in a new split pane",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane to split"),
		direction: string().required().enum("right", "left", "down", "up"),
		file: string().required().desc("Absolute file path"),
		line: number().desc("Line to open at"),
		column: number().desc("Column to open at"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolveHostClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.openFile.mutate({
				workspaceId: options.workspace,
				paneId: options.pane,
				direction: options.direction,
				filePath: options.file,
				line: options.line,
				column: options.column,
			}),
		);
		return layoutResult(`Opened ${options.file} in pane ${result.paneId}`, result);
	},
});
