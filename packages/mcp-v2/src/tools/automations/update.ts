import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { resolveWorkspacePin } from "../../host-workspaces";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "automations_update",
		description:
			"Update metadata on an existing automation (name, schedule, agent, host). Only the fields you pass change. Caller must be the automation's owner. Use automations_set_prompt to change the prompt body.",
		inputSchema: {
			id: z.string().uuid().describe("Automation UUID."),
			name: z.string().min(1).max(200).optional(),
			agent: z
				.string()
				.min(1)
				.max(200)
				.optional()
				.describe(
					"Host agent instance id (UUID from /settings/agents) or presetId. Use 'superset' for the built-in chat agent.",
				),
			targetHostId: z
				.string()
				.min(1)
				.nullish()
				.describe(
					"When passing v2WorkspaceId, set this to the workspace's hostId (from its workspaces_list row).",
				),
			v2ProjectId: z
				.string()
				.uuid()
				.optional()
				.describe(
					"When passing v2WorkspaceId, set this to the workspace's projectId (from its workspaces_list row).",
				),
			v2WorkspaceId: z
				.string()
				.uuid()
				.nullish()
				.describe(
					"Workspace UUID to reuse. Pair it with targetHostId + v2ProjectId from the same workspaces_list row.",
				),
			rrule: z.string().min(1).max(500).optional(),
			dtstart: z
				.string()
				.datetime()
				.optional()
				.describe("First scheduled fire (ISO 8601)."),
			timezone: z.string().min(1).optional(),
			mcpScope: z.array(z.string()).optional(),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			// Workspace records are host-owned: fill in the denormalized pin
			// (targetHostId + v2ProjectId) from the owning host when omitted.
			const pin = await resolveWorkspacePin(ctx, input);
			return caller.automation.update({ ...input, ...pin });
		},
	});
}
