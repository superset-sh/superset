import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_create",
		description:
			"Create a workspace on a host. A workspace is a branch-scoped working copy of a project. Use projects_list and hosts_list first to get the projectId and hostId.",
		inputSchema: {
			projectId: z.string().uuid().describe("Project UUID."),
			name: z.string().min(1).describe("Workspace name (display)."),
			branch: z.string().min(1).describe("Git branch the workspace tracks."),
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId to create the workspace on."),
			type: z
				.enum(["worktree", "main"])
				.default("worktree")
				.describe(
					"Workspace type. Defaults to 'worktree'; 'main' has special semantics.",
				),
		},
		handler: async (input, ctx) => {
			const caller = createMcpCaller(ctx);
			return caller.v2Workspace.create({
				organizationId: ctx.organizationId,
				...input,
			});
		},
	});
}
