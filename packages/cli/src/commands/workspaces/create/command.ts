import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { resolveWorkspaceHost } from "../../../lib/cloud-workspaces";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { uploadAttachments } from "../../../lib/upload-attachments";
import { createCloudWorkspace } from "./createCloudWorkspace";

export default command({
	description:
		"Create a workspace: in the cloud by default if your account has cloud workspaces, else on this machine; --local or --host picks a host",
	options: {
		host: string().desc("Create on this host (machineId)"),
		local: boolean().desc("Create on this machine"),
		environment: string().desc(
			"Environment a cloud workspace starts from (id or name; defaults to the first with repositories)",
		),
		project: string()
			.variadic()
			.desc(
				"Project ID, for a workspace on a host. Required with --local or --host unless --session. Repeatable: the first is the workspace's primary repository and each further one is checked out beside it in the same workspace folder",
			),
		session: boolean().desc(
			"Create a project-less session (a managed scratch folder) on a host. Cannot be combined with --project",
		),
		name: string().desc("Workspace name"),
		checkout: string().desc(
			"Where the files live: `worktree` (default) checks out --branch in its own worktree; `local` uses the project's checkout as it is — no branch switch, files shared with the project's other local workspaces",
		),
		branch: string().desc(
			"Git branch (required unless --pr, --task, or --checkout local is set)",
		),
		pr: number().desc("PR number — checks out the verified PR head"),
		task: string().desc(
			"Task ID to link. When --branch is omitted, the task's provider branch name (e.g. Linear's) is used verbatim",
		),
		baseBranch: string().desc(
			"Branch to fork from when `branch` does not exist (defaults to project default)",
		),
		skipBranchPrefix: boolean().desc(
			"Use --branch exactly as given instead of namespacing it under the project branch prefix",
		),
		agent: string().desc(
			"Agent to spawn after creation. Preset id (`claude`, `codex`, …), HostAgentConfig instance UUID, or `superset`",
		),
		prompt: string().desc(
			"Initial prompt the agent starts with. Required when --agent is set",
		),
		model: string().desc(
			"Model for the spawned agent (agent-specific; omit to use the agent default)",
		),
		effort: string().desc(
			"Reasoning effort for the spawned agent (agent-specific; omit to use the agent default)",
		),
		command: string().desc(
			"Shell command to run in the new workspace after creation",
		),
		attachment: string()
			.variadic()
			.desc(
				"Local file path to upload as an attachment to the host. Repeatable. Only used when --agent is set",
			),
		tag: string()
			.variadic()
			.desc(
				"Workspace tag. Repeatable. Each tag files the workspace into a sidebar folder of the same name",
			),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const defaultHostId = await resolveWorkspaceHost(
			{ host: options.host, local: options.local },
			ctx.api,
			organizationId,
		);
		if (!defaultHostId) {
			return await createCloudWorkspace({
				api: ctx.api,
				organizationId,
				options,
			});
		}
		if (options.environment) {
			throw new CLIError(
				"--environment applies to cloud workspaces",
				"Drop --local/--host to create in the cloud, or drop --environment for a workspace on a host",
			);
		}

		const [projectId, ...extraProjectIds] = options.project ?? [];
		if (options.session && projectId !== undefined) {
			throw new CLIError("--session cannot be combined with --project");
		}
		if (projectId === undefined && !options.session) {
			throw new CLIError(
				"Specify --project or --session",
				"Use --project <id> for a project workspace or --session for a project-less scratch folder",
			);
		}
		const isSession = projectId === undefined;
		const checkout = options.checkout ?? "worktree";
		if (checkout !== "worktree" && checkout !== "local") {
			throw new CLIError(
				`Unknown checkout "${checkout}"`,
				"Use --checkout worktree or --checkout local",
			);
		}
		if (extraProjectIds.length > 0 && checkout === "local") {
			throw new CLIError(
				"--checkout local takes a single --project",
				"A local workspace shares the project's own checkout, which is one repository",
			);
		}
		if (isSession && options.checkout !== undefined) {
			throw new CLIError(
				"--checkout requires --project",
				"Sessions are project-less scratch folders with no checkout to share",
			);
		}
		if (isSession) {
			for (const [flag, value] of [
				["--branch", options.branch],
				["--pr", options.pr],
				["--base-branch", options.baseBranch],
				["--task", options.task],
				["--skip-branch-prefix", options.skipBranchPrefix || undefined],
				["--tag", options.tag?.length ? options.tag : undefined],
			] as const) {
				if (value !== undefined) {
					throw new CLIError(
						`${flag} requires --project`,
						"Sessions are project-less scratch folders with no git branch semantics",
					);
				}
			}
		} else if (checkout === "local") {
			for (const [flag, value] of [
				["--branch", options.branch],
				["--pr", options.pr],
				["--base-branch", options.baseBranch],
				["--skip-branch-prefix", options.skipBranchPrefix || undefined],
			] as const) {
				if (value !== undefined) {
					throw new CLIError(
						`${flag} cannot be combined with --checkout local`,
						"A local workspace uses the project's checkout as it is; pick --checkout worktree to check out a branch",
					);
				}
			}
		} else {
			if (options.branch && options.pr) {
				throw new CLIError(
					"Specify only one of --branch or --pr",
					"Use --branch <name> or --pr <number>",
				);
			}
			if (!options.branch && !options.pr && !options.task) {
				throw new CLIError(
					"Specify --branch, --pr, --task, or --checkout local",
					"Use --branch <name>, --pr <number>, --task <id>, or --checkout local",
				);
			}
		}

		if (options.prompt && !options.agent) {
			throw new CLIError(
				"--prompt requires --agent",
				"Pass --agent <id> alongside --prompt",
			);
		}
		if (options.agent && !options.prompt) {
			throw new CLIError(
				"--agent requires --prompt",
				"Pass --prompt <text> alongside --agent",
			);
		}
		if (options.effort && !options.agent) {
			throw new CLIError(
				"--effort requires --agent",
				"Pass --agent <id> alongside --effort",
			);
		}
		if (options.model && !options.agent) {
			throw new CLIError(
				"--model requires --agent",
				"Pass --agent <id> alongside --model",
			);
		}
		if (options.attachment && options.attachment.length > 0 && !options.agent) {
			throw new CLIError(
				"--attachment requires --agent",
				"Attachments are only meaningful when launching an agent",
			);
		}

		const hostId = defaultHostId;

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		if (!isSession && !options.name) {
			throw new CLIError("--name is required when --project is set");
		}

		const attachmentIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];

		const agents =
			options.agent && options.prompt
				? [
						{
							agent: options.agent,
							prompt: options.prompt,
							model: options.model,
							effort: options.effort,
							...(attachmentIds.length > 0 ? { attachmentIds } : {}),
						},
					]
				: undefined;

		if (isSession) {
			const result = await target.client.workspaces.createSession.mutate({
				name: options.name,
				agents,
				command: options.command ?? undefined,
			});
			return {
				data: result,
				message: `Created session "${result.workspace.name}" on host ${target.hostId}`,
			};
		}

		if (!options.name) {
			throw new CLIError("--name is required when --project is set");
		}
		const create =
			checkout === "local"
				? target.client.workspaces.createLocal
				: target.client.workspaces.create;
		const result = await create.mutate({
			projectId,
			...(extraProjectIds.length > 0 ? { extraProjectIds } : {}),
			name: options.name,
			...(checkout === "local" ? { checkout } : {}),
			branch: options.branch,
			pr: options.pr,
			taskId: options.task,
			baseBranch: options.baseBranch,
			skipBranchPrefix: options.skipBranchPrefix ?? undefined,
			agents,
			command: options.command ?? undefined,
			...(options.tag?.length ? { tags: options.tag } : {}),
		});

		return {
			data: result,
			message: result.alreadyExists
				? `Reused existing workspace "${result.workspace.name}" on host ${target.hostId}`
				: `Created workspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
