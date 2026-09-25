import { boolean, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description:
		"Mark a comment thread resolved — reply first, so the reader sees what changed",
	options: {
		threadId: string().alias("thread").required().desc("Thread id to resolve"),
		reopen: boolean().desc("Reopen the thread instead of resolving it"),
	},
	run: async ({ ctx, options }) => {
		const resolved = !options.reopen;
		const result = await ctx.api.pageComment.resolve.mutate({
			threadId: options.threadId,
			resolved,
		});
		return {
			data: result,
			message: `${resolved ? "Resolved" : "Reopened"} ${options.threadId}`,
		};
	},
});
