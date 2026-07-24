import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_delete",
		description:
			"Delete a workspace by UUID on its host. The host service removes the git worktree from disk before returning. Cannot delete 'main'-type workspaces. Use hosts_list / workspaces_list to find the hostId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
			id: z.string().uuid().describe("Workspace UUID."),
		},
		handler: async (input, ctx) => {
			return hostServiceCall<{
				success: boolean;
				cloudDeleted: boolean;
				worktreeRemoved: boolean;
				branchDeleted: boolean;
				warnings: string[];
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.delete",
				"mutation",
				{ id: input.id },
			);
		},
	});
}
