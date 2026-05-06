import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_set_prompt",
		description:
			"Replace the full prompt body (markdown) for one automation. The new prompt fully overwrites the old one — fetch with automations_get_prompt first if you only want to edit. Caller must be the automation's owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
			prompt: z
				.string()
				.min(1)
				.max(100_000)
				.describe(
					"Full markdown prompt the automation runs. Replaces the existing prompt entirely.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.setPrompt(input);
		},
	});
}
