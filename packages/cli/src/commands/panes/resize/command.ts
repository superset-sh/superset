import { number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	callPanes,
	layoutResult,
	resolvePanesClient,
	workspaceOptions,
} from "../shared";

export default command({
	description:
		"Resize a pane to a share of the split that holds it (0.3 = 30%)",
	options: {
		...workspaceOptions,
		pane: string().required().desc("Pane to resize"),
		ratio: number()
			.required()
			.min(0.05)
			.max(0.95)
			.desc("Share of the parent split to give the pane, 0.05 to 0.95"),
	},
	run: async ({ ctx, options }) => {
		const client = await resolvePanesClient(ctx, options);
		const result = await callPanes(() =>
			client.panes.resize.mutate({
				workspaceId: options.workspace,
				paneId: options.pane,
				ratio: options.ratio,
			}),
		);
		return layoutResult(
			`Resized ${options.pane} to ${Math.round(options.ratio * 100)}%`,
			result,
		);
	},
});
