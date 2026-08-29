import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { workspaceTagsInputSchema } from "@superset/shared/workspace-tags";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_update",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Rename or retag a workspace on its host. Use hosts_list / workspaces_list to find the hostId.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId the workspace lives on."),
			id: z.string().uuid().describe("Workspace UUID."),
			name: z.string().min(1).optional().describe("New workspace name."),
			tags: workspaceTagsInputSchema
				.optional()
				.describe(
					"Full replacement of the workspace's tag set. Tags are plain strings, normalized to trimmed lowercase; each tag surfaces as a sidebar folder.",
				),
		},
		handler: async (input, ctx) => {
			if (input.name === undefined && input.tags === undefined) {
				throw new Error("Provide at least one of `name` or `tags`.");
			}
			return hostServiceCall(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.update",
				"mutation",
				{ id: input.id, name: input.name, tags: input.tags },
			);
		},
	});
}
