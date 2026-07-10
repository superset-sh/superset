import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Delete an automation",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		await ctx.api.automation.delete.mutate({ id });
		return {
			data: { ok: true },
			message: `Deleted automation ${id}`,
		};
	},
});
