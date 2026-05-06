import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_create",
		description:
			"Schedule a recurring agent run. Provide an RFC 5545 RRULE body for the schedule. Either v2ProjectId (run in a fresh workspace) or v2WorkspaceId (reuse an existing workspace) is required — call projects_list or workspaces_list first to get IDs. The agentConfig must contain at least { id, kind } and may include other fields the agent runtime expects.",
		inputSchema: {
			name: z
				.string()
				.min(1)
				.max(200)
				.describe("Human name for the automation."),
			prompt: z
				.string()
				.min(1)
				.max(100_000)
				.describe("Prompt the agent runs (markdown)."),
			agentConfig: z
				.object({
					id: z.string().min(1),
					kind: z.enum(["terminal", "chat"]),
				})
				.passthrough()
				.describe(
					"ResolvedAgentConfig snapshot. Get from agent settings; minimum { id, kind }.",
				),
			targetHostId: z
				.string()
				.min(1)
				.nullish()
				.describe(
					"Host that should run the automation. Defaults to the owner's online host.",
				),
			v2ProjectId: z
				.string()
				.uuid()
				.optional()
				.describe("Project UUID. Provide this OR v2WorkspaceId."),
			v2WorkspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe("Workspace UUID to reuse. Provide this OR v2ProjectId."),
			rrule: z
				.string()
				.min(1)
				.max(500)
				.describe(
					"RFC 5545 RRULE body, no DTSTART prefix. Example: FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0",
				),
			dtstart: z
				.string()
				.datetime()
				.optional()
				.describe("First scheduled fire (ISO 8601). Defaults to now."),
			timezone: z
				.string()
				.min(1)
				.describe("IANA timezone (e.g. America/New_York)."),
			mcpScope: z
				.array(z.string())
				.default([])
				.describe("Optional MCP scope strings the run should request."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.automation.create(input);
		},
	});
}
