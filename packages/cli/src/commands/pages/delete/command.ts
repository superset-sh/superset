import * as p from "@clack/prompts";
import { boolean, CLIError, positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolvePageId } from "../pageId";

export default command({
	description: "Delete a page and every version of it",
	args: [positional("page").required().desc("Page id or slug")],
	options: {
		yes: boolean().desc("Delete without asking"),
	},
	run: async ({ ctx, args, options }) => {
		// `../pageId`, never publish's own resolvePageId: that one creates a page
		// when it misses, so a typo here would create one and then delete it.
		const id = await resolvePageId(ctx, args.page as string);

		if (!options.yes && process.stdin.isTTY) {
			const confirmed = await p.confirm({
				message: `Delete page ${id} and every version of it?`,
			});
			if (p.isCancel(confirmed) || !confirmed) {
				throw new CLIError("Cancelled");
			}
		}

		await ctx.api.page.delete.mutate({ id });
		return { data: { id }, message: `Deleted page ${id}` };
	},
});
