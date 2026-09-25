import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { workspaceTagsInputSchema } from "@superset/shared/workspace-tags";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import { requireCloudUnlessHost } from "../../workspace-service-target";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_update",
		annotations: { destructiveHint: false, idempotentHint: true },
		description:
			"Rename a cloud workspace (omit hostId), or rename or retag a workspace on a host (see hosts_list / workspaces_list for the hostId). Tags exist only on host workspaces.",
		inputSchema: {
			hostId: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Host machineId the workspace lives on. Omit for a cloud workspace (accounts with cloud workspaces only).",
				),
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
			if (!input.hostId) {
				await requireCloudUnlessHost(input, ctx);
				if (input.tags !== undefined || input.name === undefined) {
					throw new Error(
						"A cloud workspace takes only `name`; tags exist on host workspaces (pass hostId)",
					);
				}
				return createMcpCaller(ctx).cloudWorkspace.rename({
					id: input.id,
					name: input.name,
				});
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
