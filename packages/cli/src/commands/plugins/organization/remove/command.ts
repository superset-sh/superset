import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description:
		"Delete a plugin from your organization, and every member's install of it",
	args: [positional("name").required().desc("Plugin name")],
	run: async ({ ctx, args }) => {
		const name = args.name as string;
		await ctx.api.plugins.organization.remove.mutate({ name });
		return {
			data: { name },
			message: `Removed ${name} from your organization.`,
		};
	},
});
