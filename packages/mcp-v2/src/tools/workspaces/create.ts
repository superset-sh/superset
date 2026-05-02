import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceMutation } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_create",
		description:
			"Create a workspace on a host. A workspace is a branch-scoped working copy of a project. The host service materializes the git worktree on disk before returning. Use projects_list and hosts_list first to get the projectId and hostId.",
		inputSchema: {
			projectId: z.string().uuid().describe("Project UUID."),
			name: z.string().min(1).describe("Workspace name (display)."),
			branch: z.string().min(1).describe("Git branch the workspace tracks."),
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId to create the workspace on."),
		},
		handler: async (input, ctx) => {
			return hostServiceMutation<
				{ projectId: string; name: string; branch: string },
				{ id: string; projectId: string; branch: string; worktreePath: string }
			>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspace.create",
				{
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
				},
			);
		},
	});
}
