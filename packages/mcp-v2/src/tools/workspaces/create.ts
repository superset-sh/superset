import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

const agentLaunchSchema = z.object({
	agent: z
		.string()
		.min(1)
		.describe(
			"Agent preset id (e.g. `claude`, `codex`) or HostAgentConfig instance UUID.",
		),
	prompt: z.string().min(1).describe("Initial prompt the agent starts with."),
	attachmentIds: z
		.array(z.string().uuid())
		.optional()
		.describe(
			"Host-scoped attachment UUIDs. The host resolves these to absolute paths and appends them to the prompt.",
		),
});

export function register(server: McpServer): void {
	defineTool(server, {
		name: "workspaces_create",
		description:
			"Create a workspace on a host. A workspace is a branch-scoped working copy of a project. The host service materializes the git worktree on disk before returning. Provide exactly one of `branch` or `pr`. Optionally pass `agents` to spawn one or more agents in the workspace as soon as it is ready (each entry runs the equivalent of `agents_run` against the new workspace). Use projects_list and hosts_list first to get the projectId and hostId.",
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
			agents: z
				.array(agentLaunchSchema)
				.optional()
				.describe(
					"Agents to spawn in the workspace immediately after creation.",
				),
		},
		handler: async (input, ctx) => {
			return hostServiceCall<{
				workspace: {
					id: string;
					projectId: string;
					name: string;
					branch: string;
				};
				terminals: Array<{ terminalId: string; label?: string }>;
				agents: Array<
					| { ok: true; sessionId: string; label: string }
					| { ok: false; error: string }
				>;
				alreadyExists: boolean;
			}>(
				{
					relayUrl: ctx.relayUrl,
					organizationId: ctx.organizationId,
					hostId: input.hostId,
					jwt: ctx.bearerToken,
				},
				"workspaces.create",
				"mutation",
				{
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
					pr: input.pr,
					baseBranch: input.baseBranch,
					taskId: input.taskId,
					agents: input.agents,
				},
			);
		},
	});
}
