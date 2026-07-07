import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import {
	type HostWorkspaceRow,
	listHostWorkspaces,
} from "../../host-workspaces";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_update",
		description:
			"Update fields on an existing workspace. At least one field is required. Workspace records are host-owned: the update is routed to the host that owns the workspace, so that host must be reachable.",
		inputSchema: {
			id: z.string().uuid().describe("Workspace UUID."),
			name: z.string().min(1).optional().describe("New workspace name."),
		},
		handler: async (input, ctx) => {
			const { workspaces } = await listHostWorkspaces(ctx);
			const workspace = workspaces.find((row) => row.id === input.id);
			if (!workspace) {
				throw new Error(
					`Workspace not found on any reachable host: ${input.id}`,
				);
			}
			return hostServiceCall<
				Omit<HostWorkspaceRow, "worktreePath" | "worktreeExists">
			>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: workspace.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.update",
				"mutation",
				{ id: input.id, name: input.name },
			);
		},
	});
}
