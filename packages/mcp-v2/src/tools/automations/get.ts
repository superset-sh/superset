import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_get",
		description:
			"Get a single automation's metadata. Returns name, schedule, agent, host — the prompt body is omitted (call automations_get_prompt to fetch it). For run history, call automations_logs. Caller must be the automation's owner.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const { prompt: _prompt, ...rest } = await caller.automation.get({
				id: input.id,
			});
			return rest;
		},
	});
}
