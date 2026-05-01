import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_list",
		description:
			"List automations (scheduled agent runs) the calling user owns in the active organization. Returns a summary shape — call automations_get to fetch the full prompt and agentConfig for one automation.",
		handler: async (_input, ctx) => {
			const caller = createMcpCaller(ctx);
			const rows = await caller.automation.list();
			return rows.map(({ prompt: _prompt, ...rest }) => rest);
		},
	});
}
