import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description: "Remove a marketplace from your account",
	args: [positional("name").required().desc("Marketplace name")],
	run: async ({ ctx, args }) => {
		const name = args.name as string;
		await ctx.api.plugins.marketplaces.remove.mutate({ name });
		return { data: { name }, message: `Removed marketplace "${name}".` };
	},
});
