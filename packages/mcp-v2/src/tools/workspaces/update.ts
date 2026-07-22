import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_update",
		description:
			"Rename a workspace on its host. Use hosts_list / workspaces_list to find the hostId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
			id: z.string().uuid().describe("Workspace UUID."),
			name: z.string().min(1).describe("New workspace name."),
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
				{ id: input.id, name: input.name },
			);
		},
	});
}
