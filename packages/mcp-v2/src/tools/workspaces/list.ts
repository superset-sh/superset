import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { listHostWorkspaces } from "../../host-workspaces";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_list",
		description:
			"List workspaces (branch-scoped working copies) in the active organization. Workspace records are host-owned: each online host is queried directly, so results only reflect reachable hosts (hosts that failed to answer are listed in unreachableHosts). Optionally narrow by host. Rows carry hostId and projectId — pass those as targetHostId/v2ProjectId when pinning an automation to a workspace via v2WorkspaceId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Restrict to a specific host. Omit to query all online hosts.",
				),
		},
		handler: async (input, ctx) => {
			return listHostWorkspaces(ctx, input.hostId);
		},
	});
}
