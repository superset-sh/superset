import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_delete",
		description:
			"Delete a workspace by UUID. The host service removes the git worktree from disk before returning. Idempotent — succeeds with alreadyGone:true if the workspace is gone. Cannot delete 'main'-type workspaces.",
		inputSchema: {
			id: z.string().uuid().describe("Workspace UUID."),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			const workspace = await caller.v2Workspace.getFromHost({
				organizationId: ctx.organizationId,
				id: input.id,
			});
			if (!workspace) {
				return { success: true, alreadyGone: true };
			}
			return hostServiceCall<{ success: boolean }>(
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
