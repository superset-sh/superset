import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_list",
		description:
			"List all automations (scheduled agent runs) the calling user owns in the active organization. Use this to find an automation's id before calling other automation tools.",
		handler: async (_input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.list();
		},
	});
}
