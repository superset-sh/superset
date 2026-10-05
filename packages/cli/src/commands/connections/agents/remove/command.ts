import { positional } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	sandbox: false,
	description: "Sign an agent out of your cloud workspaces",
	args: [positional("agent").required().desc("Agent: claude or codex")],
	run: async ({ ctx, args }) => {
		const removed = await ctx.api.agentCredential.remove.mutate({
			agent: args.agent as string,
		});
		return {
			data: removed,
			message: `Signed ${removed.agent} out of your cloud workspaces`,
		};
	},
});
