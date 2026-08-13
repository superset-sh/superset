import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "factory_report",
		annotations: { destructiveHint: false },
		description:
			"Report the result of a factory pipeline stage run. Call exactly once, as your final action, using the runId/itemId/expectedRevision from your dispatch prompt. outcome 'success' requires a result matching the stage's schema and advances the item; 'blocked' records why you could not finish and leaves the item in place. Rejects with a conflict if the item changed since dispatch — re-read the returned state and only retry if your work is still the pending one.",
		inputSchema: {
			runId: z.string().uuid().describe("Run UUID from the dispatch prompt."),
			itemId: z
				.string()
				.uuid()
				.optional()
				.describe("Item UUID from the dispatch prompt (cross-check only)."),
			expectedRevision: z
				.number()
				.int()
				.nonnegative()
				.describe("Item revision from the dispatch prompt."),
			outcome: z.enum(["success", "blocked"]),
			result: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("Stage result object; required when outcome is 'success'."),
			rationale: z
				.string()
				.min(1)
				.max(4000)
				.describe("1-3 sentences on how you reached the result."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.factory.report({
				runId: input.runId,
				itemId: input.itemId,
				expectedRevision: input.expectedRevision,
				outcome: input.outcome,
				result: input.result,
				rationale: input.rationale,
			});
		},
	});
}
