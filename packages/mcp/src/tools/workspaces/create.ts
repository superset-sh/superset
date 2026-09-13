import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";

const agentLaunchSchema = z.object({
	agent: z
		.string()
		.min(1)
		.describe(
			"Agent preset id (e.g. `claude`, `codex`, `superset`) or HostAgentConfig instance UUID.",
		),
	prompt: z.string().min(1).describe("Initial prompt the agent starts with."),
	model: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Model for this launch. Supported values depend on the agent; omit to use its default.",
		),
	effort: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Reasoning effort for this launch. Supported values depend on the agent; omit to use its default.",
		),
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
		annotations: { destructiveHint: false },
		description:
			"Create a workspace on a host. Use `checkout: local` to share the project checkout without switching branches, or omit checkout to create an isolated worktree. Local workspaces share files, index and branch with other local workspaces. For worktrees, provide a branch or PR. Omit `projectId` (and `branch`/`pr`/`baseBranch`/`taskId`) to create a project-less session instead — a managed scratch folder (its own git repo, no branch/PR semantics). Optionally pass `agents` to spawn one or more agents in the workspace as soon as it is ready (each entry runs the equivalent of `agents_create` against the new workspace), and/or pass `command` to run a one-off shell command in the worktree. Use projects_list and hosts_list first to get the projectId and hostId.",
		inputSchema: {
			checkout: z
				.enum(["worktree", "local"])
				.optional()
				.describe(
					"Where files live. Local shares the project checkout; worktree creates an isolated checkout.",
				),
			projectId: z
				.string()
				.uuid()
				.optional()
				.describe(
					"Project UUID. Omit to create a project-less session (managed scratch folder).",
				),
			name: z.string().min(1).describe("Workspace name (display)."),
			branch: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Git branch the workspace tracks. Omit for a local checkout.",
				),
			pr: z
				.number()
				.int()
				.positive()
				.optional()
				.describe(
					"Pull request number — server checks out the verified PR head and derives the branch.",
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
			command: z
				.string()
				.min(1)
				.optional()
				.describe("Shell command to run in the new worktree after creation."),
		},
		handler: async (input, ctx) => {
			if (input.checkout === "local") {
				for (const field of ["branch", "pr", "baseBranch"] as const) {
					if (input[field] !== undefined)
						throw new Error(`${field} cannot be combined with checkout local`);
				}
			}
			if (input.projectId === undefined) {
				for (const [field, value] of [
					["checkout", input.checkout],
					["branch", input.branch],
					["pr", input.pr],
					["baseBranch", input.baseBranch],
					["taskId", input.taskId],
				] as const) {
					if (value !== undefined) {
						throw new Error(
							`\`${field}\` requires \`projectId\` — sessions are project-less scratch folders with no git branch semantics`,
						);
					}
				}
				return hostServiceCall<{
					workspace: {
						id: string;
						projectId: string | null;
						name: string;
						branch: string;
					};
					terminals: Array<{ terminalId: string; label?: string }>;
					agents: Array<
						| { ok: true; kind: "terminal"; sessionId: string; label: string }
						| { ok: false; error: string }
					>;
				}>(
					{
						relayUrl: ctx.relayUrl,
						organizationId: ctx.organizationId,
						hostId: input.hostId,
						jwt: ctx.bearerToken,
					},
					"workspaces.createSession",
					"mutation",
					{
						name: input.name,
						agents: input.agents,
						command: input.command,
					},
				);
			}
			return hostServiceCall<{
				workspace: {
					id: string;
					projectId: string;
					name: string;
					branch: string;
				};
				terminals: Array<{ terminalId: string; label?: string }>;
				agents: Array<
					| { ok: true; kind: "terminal"; sessionId: string; label: string }
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
				input.checkout === "local"
					? "workspaces.createLocal"
					: "workspaces.create",
				"mutation",
				{
					projectId: input.projectId,
					checkout: input.checkout,
					name: input.name,
					branch: input.branch,
					pr: input.pr,
					baseBranch: input.baseBranch,
					taskId: input.taskId,
					agents: input.agents,
					command: input.command,
				},
			);
		},
	});
}
