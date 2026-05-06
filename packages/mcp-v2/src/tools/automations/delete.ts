import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_delete",
		description:
			"Delete an automation. The recurring schedule stops immediately; past runs remain. Caller must be the owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.delete({ id: input.id });
		},
	});
}
