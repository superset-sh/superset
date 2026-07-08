import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_list",
		description:
			"List workspaces (branch-scoped working copies) in the active organization. Optionally narrow by host. Use this to find a workspace ID for automations_create's v2WorkspaceId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Restrict to a specific host. Omit to list across all hosts.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.v2Workspace.list({
				organizationId: ctx.organizationId,
				...(input.hostId ? { hostId: input.hostId } : {}),
			});
		},
	});
}
