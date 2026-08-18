import { writeFile } from "node:fs/promises";
import { string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveBrowserTarget } from "../shared";

export default command({
	description: "Capture a PNG screenshot of a browser pane",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		pane: string().required().desc("Pane ID (from `superset browser list`)"),
		out: string().desc("Write PNG to this path instead of printing base64"),
	},
	run: async ({ ctx, options }) => {
		const { client } = await resolveBrowserTarget(ctx, options);
		const { base64 } = await client.browser.screenshot.mutate({
			workspaceId: options.workspace,
			paneId: options.pane,
		});
		if (options.out) {
			await writeFile(options.out, Buffer.from(base64, "base64"));
			return { data: { path: options.out }, message: `Wrote ${options.out}` };
		}
		return { data: { base64 }, message: base64 };
	},
});
