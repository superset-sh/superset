import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { resolveWorkspacePin } from "../../host-workspaces";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_create",
		description:
			"Schedule a recurring agent run. Provide an RFC 5545 RRULE body for the schedule. Either v2ProjectId (run in a fresh workspace) or v2WorkspaceId (reuse an existing workspace) is required — call projects_list or workspaces_list first to get IDs. `agent` is the host-agent instance id (or presetId fallback) that runs the prompt; pass 'superset' for the built-in chat agent.",
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
			agent: z
				.string()
				.min(1)
				.max(200)
				.describe(
					"Host agent instance id (UUID from /settings/agents) or presetId (e.g. 'claude', 'codex'). Use 'superset' for the built-in chat agent.",
				),
			targetHostId: z
				.string()
				.min(1)
				.nullish()
				.describe(
					"Host that should run the automation. Defaults to the owner's online host. When passing v2WorkspaceId, set this to the workspace's hostId (from its workspaces_list row).",
				),
			v2ProjectId: z
				.string()
				.uuid()
				.optional()
				.describe(
					"Project UUID. Provide this OR v2WorkspaceId. When passing v2WorkspaceId, also set this to the workspace's projectId (from its workspaces_list row).",
				),
			v2WorkspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Workspace UUID to reuse. Provide this OR v2ProjectId. Pair it with targetHostId + v2ProjectId from the same workspaces_list row.",
				),
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
			// Workspace records are host-owned: fill in the denormalized pin
			// (targetHostId + v2ProjectId) from the owning host when omitted.
			const pin = await resolveWorkspacePin(ctx, input);
			return caller.automation.create({ ...input, ...pin });
		},
	});
}
