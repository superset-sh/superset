import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import { listHostWorkspaces } from "../../host-workspaces";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_delete",
		description:
			"Delete a workspace by UUID. The host service removes the git worktree from disk before returning. Idempotent — succeeds with alreadyGone:true if the workspace is gone. Cannot delete 'main'-type workspaces.",
		inputSchema: {
			id: z.string().uuid().describe("Workspace UUID."),
		},
		handler: async (input, ctx) => {
			// Workspace records are host-owned: resolve the owning host across
			// the org's reachable hosts.
			const { workspaces, unreachableHosts } = await listHostWorkspaces(ctx);
			const workspace = workspaces.find((row) => row.id === input.id);
			if (!workspace) {
				if (unreachableHosts.length > 0) {
					throw new Error(
						`Workspace not found on any reachable host: ${input.id} (unreachable hosts: ${unreachableHosts.map((host) => host.hostId).join(", ")})`,
					);
				}
				return {
					success: true,
					alreadyGone: true,
					cloudDeleted: false,
					worktreeRemoved: false,
					branchDeleted: false,
					warnings: [],
				};
			}
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
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.delete",
				"mutation",
				{ id: input.id },
			);
		},
	});
}
