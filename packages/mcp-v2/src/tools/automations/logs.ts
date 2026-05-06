import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_logs",
		description:
			"List recent runs for an automation. Returns up to `limit` runs ordered newest-first. Caller must be the automation's owner.",
		inputSchema: {
			automationId: z.string().uuid().describe("Automation UUID."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.default(20)
				.describe("Max runs to return. Default 20, max 100."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.listRuns(input);
		},
	});
}
