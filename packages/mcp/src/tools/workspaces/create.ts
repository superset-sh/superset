import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	selectCloudEnvironment,
	startableCloudEnvironments,
} from "@superset/shared/cloud-environments";
import { z } from "zod";
import type { McpContext } from "../../auth";
import { createMcpCaller } from "../../caller";
import { defineTool } from "../../define-tool";
import { hostServiceCall } from "../../host-service-client";
import { requireCloudUnlessHost } from "../../workspace-service-target";

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
			"Create a workspace. Without hostId it is a cloud workspace: it starts from `environment` (by id or name; its repositories are the checkouts; defaults to the first environment with repositories), runs on Superset's infrastructure so it keeps going when the user's laptop sleeps, and returns as soon as its row exists in status 'provisioning' — poll workspaces_list until it is 'ready'. It bills until deleted, so call workspaces_delete when the work is done. A cloud workspace takes `name`, `branch` and at most one entry in `agents` (claude or codex); host-only fields are rejected. With hostId it is created on that host (see projects_list and hosts_list): use `checkout: local` to share the project checkout without switching branches, or omit checkout for an isolated worktree with a branch or PR; omit `projectId` (and `branch`/`pr`/`baseBranch`/`taskId`) for a project-less session. `agents` spawns agents once the workspace is ready (the equivalent of agents_create) and `command` runs a one-off shell command.",
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
			name: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Workspace name. Required on a host; a cloud workspace without one is named from its agent's prompt.",
				),
			environment: z
				.string()
				.min(1)
				.optional()
				.describe(
					"Cloud only: environment the workspace starts from, by id or name. Defaults to the first environment with repositories.",
				),
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
				.optional()
				.describe(
					"Host machineId to create the workspace on. Omit for a cloud workspace (accounts with cloud workspaces only).",
				),
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
			if (!input.hostId) {
				await requireCloudUnlessHost(input, ctx);
				return createInCloud(input, ctx);
			}
			const hostId = input.hostId;
			if (input.environment !== undefined) {
				throw new Error(
					"`environment` applies to cloud workspaces; omit hostId to create one",
				);
			}
			if (input.name === undefined) {
				throw new Error("`name` is required for a workspace on a host");
			}
			const name = input.name;
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
						hostId,
						jwt: ctx.bearerToken,
					},
					"workspaces.createSession",
					"mutation",
					{
						name,
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
					hostId,
					jwt: ctx.bearerToken,
				},
				input.checkout === "local"
					? "workspaces.createLocal"
					: "workspaces.create",
				"mutation",
				{
					projectId: input.projectId,
					checkout: input.checkout,
					name,
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

async function createInCloud(
	input: {
		name?: string;
		branch?: string;
		environment?: string;
		projectId?: string;
		checkout?: string;
		pr?: number;
		baseBranch?: string;
		taskId?: string;
		command?: string;
		agents?: Array<z.infer<typeof agentLaunchSchema>>;
	},
	ctx: McpContext,
) {
	for (const [field, value] of [
		["projectId", input.projectId],
		["checkout", input.checkout],
		["pr", input.pr],
		["baseBranch", input.baseBranch],
		["taskId", input.taskId],
		["command", input.command],
	] as const) {
		if (value !== undefined) {
			throw new Error(
				`\`${field}\` applies to a workspace on a host; pass hostId, or drop it for a cloud workspace`,
			);
		}
	}
	const [launch, ...extra] = input.agents ?? [];
	if (extra.length > 0 || launch?.attachmentIds?.length) {
		throw new Error(
			"A cloud workspace launches at most one agent, without attachments",
		);
	}

	const caller = createMcpCaller(ctx);
	const environments = await caller.environment.list({
		organizationId: ctx.organizationId,
	});
	const startable = startableCloudEnvironments(environments);
	const environment = selectCloudEnvironment(environments, input.environment);
	if (!environment || !startable.includes(environment)) {
		throw new Error(
			startable.length === 0
				? "No environment with repositories in this organization. Create one in Settings → Environments."
				: `${environment ? `Environment "${environment.name}" has no repositories` : `No environment "${input.environment}"`}. Start from one of: ${startable.map((row) => row.name).join(", ")}`,
		);
	}

	return caller.cloudWorkspace.create({
		organizationId: ctx.organizationId,
		environmentId: environment.id,
		...(input.name ? { name: input.name } : {}),
		...(input.branch ? { branch: input.branch } : {}),
		...(launch
			? {
					agent: launch.agent,
					prompt: launch.prompt,
					...(launch.model ? { model: launch.model } : {}),
					...(launch.effort ? { effort: launch.effort } : {}),
				}
			: {}),
	});
}
