import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Show a single automation's configuration",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		const automation = await ctx.api.automation.get.query({ id });
		return { data: automation };
	},
});
