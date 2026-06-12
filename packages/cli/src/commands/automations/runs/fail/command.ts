import { readFileSync } from "node:fs";
import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description: "Mark an automation run failed",
	args: [positional("id").required().desc("Automation run id")],
	options: {
		reason: string().required().desc("Short failure reason"),
		resultFile: string().desc("Optional Markdown report with failure details"),
		summary: string().desc("Optional short result summary"),
	},
	run: async ({ ctx, args, options }) => {
		const runId = args.id as string;
		const resultMarkdown = options.resultFile
			? readFileSync(options.resultFile, "utf-8")
			: undefined;

		const result = await ctx.api.automation.failRun.mutate({
			runId,
			failureReason: options.reason,
			resultMarkdown,
			resultSummary: options.summary,
		});

		return {
			data: result,
			message: `Failed automation run ${runId}`,
		};
	},
});
