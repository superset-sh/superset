import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceMutation } from "../../host-service-client";

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_create",
		description:
			"Create a workspace on a host. A workspace is a branch-scoped working copy of a project. The host service materializes the git worktree on disk before returning. Provide exactly one of `branch` or `pr`. Use projects_list and hosts_list first to get the projectId and hostId.",
		inputSchema: {
			projectId: z.string().uuid().describe("Project UUID."),
			name: z.string().min(1).describe("Workspace name (display)."),
			branch: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Git branch the workspace tracks. Required unless `pr` is set.",
				),
			pr: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Pull request number — server runs `gh pr checkout` and derives the branch.",
				),
			baseBranch: z
				.string()
				.optional()
				.describe(
					"Branch to fork from when `branch` does not exist (defaults to project default). Ignored when `pr` is set.",
				),
			hostId: z
				.string()
				.min(1)
				.describe("Host machineId to create the workspace on."),
			taskId: z
				.string()
				.uuid()
				.optional()
				.describe("Optional Superset task id to link to the new workspace."),
		},
		handler: async (input, ctx) => {
			return hostServiceMutation<
				{
					projectId: string;
					name: string;
					branch?: string;
					pr?: number;
					baseBranch?: string;
					taskId?: string;
				},
				{
					workspace: {
						id: string;
						projectId: string;
						name: string;
						branch: string;
					};
					terminals: Array<{ terminalId: string; label?: string }>;
					agents: Array<unknown>;
					alreadyExists: boolean;
				}
			>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspaces.create",
				{
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
					pr: input.pr,
					baseBranch: input.baseBranch,
					taskId: input.taskId,
				},
			);
		},
	});
}
