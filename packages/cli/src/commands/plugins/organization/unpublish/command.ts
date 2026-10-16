import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description:
		"Take a plugin back from members without deleting it. Its tools stop working until it is published again",
	args: [positional("name").required().desc("Plugin name")],
	run: async ({ ctx, args }) => {
		const name = args.name as string;
		const result = await ctx.api.plugins.organization.setPublished.mutate({
			name,
			published: false,
		});
		return { data: result, message: `Unpublished ${name}.` };
	},
});
