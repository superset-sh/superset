import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Pause an automation (stops scheduled firing)",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		const result = await ctx.api.automation.setEnabled.mutate({
			id,
			enabled: false,
		});
		return {
			data: result,
			message: `Paused automation ${id}`,
		};
	},
});
