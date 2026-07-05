import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Trigger an automation to run immediately",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		const result = await ctx.api.automation.runNow.mutate({ id });
		return {
			data: result,
			message: `Dispatched automation ${id}. Run id: ${result.runId}`,
		};
	},
});
