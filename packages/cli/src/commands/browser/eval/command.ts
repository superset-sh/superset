import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "Evaluate JavaScript in a browser pane and return the result",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
		code: string().required().desc("JavaScript expression to evaluate"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		const { result } = await client.browser.eval.mutate({
			workspaceId: options.workspace,
			paneId: options.pane,
			code: options.code,
		});
		return {
			data: { result },
			message:
				typeof result === "string" ? result : JSON.stringify(result, null, 2),
		};
	},
});
