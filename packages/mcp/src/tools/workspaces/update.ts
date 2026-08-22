import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_update",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Rename or re-parent a workspace on its host. Use hosts_list / workspaces_list to find the hostId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
			id: z.string().uuid().describe("Workspace UUID."),
			name: z.string().min(1).optional().describe("New workspace name."),
			parentWorkspaceId: z
				.string()
				.uuid()
				.nullable()
				.optional()
				.describe(
					"Re-parent the workspace for sidebar lineage: a workspace UUID nests under it, explicit null detaches to the top level. Omit to leave lineage untouched. Metadata only — never affects the git base branch.",
				),
		},
		handler: async (input, ctx) => {
			return hostServiceCall(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.update",
				"mutation",
				{
					id: input.id,
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.parentWorkspaceId !== undefined
						? { parentWorkspaceId: input.parentWorkspaceId }
						: {}),
				},
			);
		},
	});
}
