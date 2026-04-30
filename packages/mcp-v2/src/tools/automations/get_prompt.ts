import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_get_prompt",
		description:
			"Fetch the full prompt body (markdown) for one automation. Use this when you need to read or edit the prompt — automations_get and automations_list omit the body to keep responses small. Caller must be the automation's owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.getPrompt({ id: input.id });
		},
	});
}
