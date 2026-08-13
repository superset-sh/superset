import { readFileSync } from "node:fs";
import { CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Report a factory stage run result. Stage agents call this exactly once, as their final action, using the runId/revision from their dispatch prompt (fallback when the factory_report MCP tool is unavailable).",
	options: {
		run: string().required().desc("Run UUID from the dispatch prompt"),
		revision: number()
			.int()
			.min(0)
			.required()
			.desc("expectedRevision from the dispatch prompt"),
		outcome: string().required().desc('"success" or "blocked"'),
		result: string().desc(
			"JSON result matching the stage schema (required for success)",
		),
		"result-file": string().desc("Read the result JSON from a file instead"),
		rationale: string()
			.required()
			.desc("1-3 sentences on how you reached the result"),
	},
	run: async ({ ctx, options }) => {
		const outcome = options.outcome as string;
		if (outcome !== "success" && outcome !== "blocked") {
			throw new CLIError('outcome must be "success" or "blocked"');
		}
		const rawResult = options["result-file"]
			? readFileSync(options["result-file"] as string, "utf8")
			: (options.result as string | undefined);
		let result: unknown;
		if (rawResult) {
			try {
				result = JSON.parse(rawResult);
			} catch {
				throw new CLIError("result is not valid JSON");
			}
		}
		const reported = await ctx.api.factory.report.mutate({
			runId: options.run as string,
			expectedRevision: options.revision as number,
			outcome,
			result,
			rationale: options.rationale as string,
		});
		return {
			data: reported,
			message: `reported ${outcome}; item is now in ${reported.stage} (revision ${reported.revision})`,
		};
	},
});
