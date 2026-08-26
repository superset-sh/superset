import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { agentSessionId } from "../agentSession";

export default command({
	description:
		"Reply to a comment thread — answer only threads handed off to this session",
	options: {
		threadId: string().alias("thread").required().desc("Thread id to reply to"),
	},
	args: [positional("body").required().desc("Reply text")],
	run: async ({ ctx, options, args }) => {
		const result = await ctx.api.pageComment.reply.mutate({
			threadId: options.threadId,
			body: args.body as string,
			agentSessionId: agentSessionId(),
		});
		return {
			data: result,
			message: `Replied to ${options.threadId}`,
		};
	},
});
