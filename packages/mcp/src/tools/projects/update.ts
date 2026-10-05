import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import { updateProjectCollection } from "./update-utils";

const collectionInputSchema = z.string().trim().min(1).max(200);

export function register(server: McpServer): void {
	defineTool(server, {
		name: "projects_update",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Move a project into a collection on a host, or remove it from its collection by passing collection: null. Use hosts_list and projects_list to resolve the hostId and project id.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe(
					"Host machineId where the project is set up. See hosts_list to enumerate accessible hosts.",
				),
			id: z.string().uuid().describe("Project UUID."),
			collection: collectionInputSchema
				.nullable()
				.describe(
					"Collection name or tag. Pass null to remove the project from its collection.",
				),
		},
		handler: async (input, ctx) =>
			updateProjectCollection(
				input,
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				hostServiceCall,
			),
	});
}
