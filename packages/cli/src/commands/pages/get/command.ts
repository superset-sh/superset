import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { pageRefFromArg } from "../pageRef";

export default command({
	description: "Show a page",
	args: [positional("page").required().desc("Page id or slug")],
	run: async ({ ctx, args }) => ({
		data: await ctx.api.page.get.query(pageRefFromArg(args.page as string)),
	}),
});
