import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description: "Publish an uploaded plugin, so members can install it",
	args: [positional("name").required().desc("Plugin name")],
	run: async ({ ctx, args }) => {
		const name = args.name as string;
		const result = await ctx.api.plugins.organization.setPublished.mutate({
			name,
			published: true,
		});
		return {
			data: result,
			message: `Published ${name}. Members install it with: superset plugins install ${name}`,
		};
	},
});
