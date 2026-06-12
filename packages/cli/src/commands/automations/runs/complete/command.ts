import { readFileSync } from "node:fs";
import { positional, string } from "@superset/cli-framework";
import { command } from "../../../../lib/command";

export default command({
	description: "Mark an automation run completed with a Markdown report",
	args: [positional("id").required().desc("Automation run id")],
	options: {
		resultFile: string()
			.required()
			.desc("Path to a Markdown file containing the run result report"),
		summary: string().desc("Optional short result summary"),
	},
	run: async ({ ctx, args, options }) => {
		const runId = args.id as string;
		const resultMarkdown = readFileSync(options.resultFile, "utf-8");
		if (!resultMarkdown.trim()) {
			throw new Error("Refusing to complete a run with an empty result file.");
		}

		const result = await ctx.api.automation.completeRun.mutate({
			runId,
			resultMarkdown,
			resultSummary: options.summary,
		});

		return {
			data: result,
			message: `Completed automation run ${runId}`,
		};
	},
});
