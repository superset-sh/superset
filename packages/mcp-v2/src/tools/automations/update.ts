import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_update",
		description:
			"Update fields on an existing automation. Only the fields you pass change. Caller must be the automation's owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
			name: z.string().min(1).max(200).optional(),
			prompt: z.string().min(1).max(20_000).optional(),
			agentConfig: z
				.object({
					id: z.string().min(1),
					kind: z.enum(["terminal", "chat"]),
				})
				.passthrough()
				.optional(),
			targetHostId: z.string().min(1).nullish(),
			v2ProjectId: z.string().uuid().optional(),
			v2WorkspaceId: z.string().uuid().nullish(),
			rrule: z.string().min(1).max(500).optional(),
			dtstart: z.coerce.date().optional(),
			timezone: z.string().min(1).optional(),
			mcpScope: z.array(z.string()).optional(),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.update(input);
		},
	});
}
