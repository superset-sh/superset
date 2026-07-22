import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "projects_list",
		description:
			"List projects set up on a host. A project is a checked-out repo; projects are host-owned — use hosts_list first to get the hostId. Use this to find a project's id before creating a workspace or scheduling an automation.",
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
				"project.list",
				"query",
			);
		},
	});
}
