import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_list",
		description:
			"List automations (scheduled agent runs) the calling user owns in the active organization. Returns a summary shape — call automations_get_prompt to fetch the prompt for one automation, or automations_get for the rest of its config. Pass `name` to filter rows by case-insensitive substring match on the automation name.",
		inputSchema: {
			name: z
				.string()
				.optional()
				.describe(
					"Filter rows by case-insensitive substring match on automation name.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return await caller.automation.list(
				input.name ? { name: input.name } : undefined,
			);
		},
	});
}
