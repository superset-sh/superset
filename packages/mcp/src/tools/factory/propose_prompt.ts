import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "factory_propose_prompt",
		annotations: { destructiveHint: false },
		description:
			"Propose an improved stage prompt for a factory pipeline stage, as the improve meta-agent. Call exactly once, as your final action, using the improveRunId from your dispatch prompt. Creates a DRAFT prompt version for human review — it never activates itself.",
		inputSchema: {
			improveRunId: z
				.string()
				.uuid()
				.describe("Improve-run UUID from the dispatch prompt."),
			content: z
				.string()
				.min(1)
				.max(20_000)
				.describe("The full rewritten stage prompt text."),
			rationale: z
				.string()
				.min(1)
				.max(4000)
				.describe("1-3 sentences: what changed and which feedback drove it."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.factory.proposePrompt({
				improveRunId: input.improveRunId,
				content: input.content,
				rationale: input.rationale,
			});
		},
	});
}
