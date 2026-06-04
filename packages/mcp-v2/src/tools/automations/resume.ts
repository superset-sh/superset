import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_resume",
		description:
			"Resume a paused automation. The next scheduled fire is recomputed from the RRULE. Caller must be the owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.setEnabled({ id: input.id, enabled: true });
		},
	});
}
