import { positional } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description: "Show a single automation's configuration",
	args: [positional("id").required().desc("Automation id")],
	run: async ({ ctx, args }) => {
		const id = args.id as string;
		const result = await ctx.api.automation.get.query({ id });
		// Prompt is fetched via `superset automations prompt <id>` (it can be
		// large markdown). Runs are paginated via `superset automations logs <id>`.
		const { prompt: _prompt, ...automation } = result;
		return { data: automation };
	},
});
