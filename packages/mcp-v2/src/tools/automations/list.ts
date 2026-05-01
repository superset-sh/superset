import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_list",
		description:
			"List automations (scheduled agent runs) the calling user owns in the active organization. Returns a summary shape — call automations_get_prompt to fetch the prompt for one automation, or automations_get for the rest of its config.",
		handler: async (_input, ctx) => {
			const caller = createMcpCaller(ctx);
			return await caller.automation.list();
		},
	});
}
