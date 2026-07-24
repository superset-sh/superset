import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_list",
		description:
			"List workspaces (branch-scoped working copies) on a host. Workspaces are host-owned — use hosts_list first to get the hostId. Rows include the host-served projectName. Use this to find a workspace ID for automations_create's v2WorkspaceId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe(
					"Host machineId to query. See `hosts_list` to enumerate accessible hosts.",
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
				"workspace.list",
				"query",
			);
		},
	});
}
