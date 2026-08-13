import { readFileSync } from "node:fs";
import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";

export default command({
	description:
		"Propose an improved stage prompt as the factory improve meta-agent (creates a DRAFT for human review; fallback when the factory_propose_prompt MCP tool is unavailable).",
	options: {
		"improve-run": string()
			.required()
			.desc("Improve-run UUID from the dispatch prompt"),
		"content-file": string().desc(
			"File containing the full rewritten prompt text",
		),
		content: string().desc("The full rewritten prompt text inline"),
		rationale: string()
			.required()
			.desc("1-3 sentences: what changed and which feedback drove it"),
	},
	run: async ({ ctx, options }) => {
		const content = options["content-file"]
			? readFileSync(options["content-file"] as string, "utf8")
			: (options.content as string | undefined);
		if (!content?.trim()) {
			throw new CLIError("provide --content or --content-file");
		}
		const draft = await ctx.api.factory.proposePrompt.mutate({
			improveRunId: options["improve-run"] as string,
			content,
			rationale: options.rationale as string,
		});
		return {
			data: draft,
			message: `draft v${draft.version} created for ${draft.stage} — awaiting human approval`,
		};
	},
});
