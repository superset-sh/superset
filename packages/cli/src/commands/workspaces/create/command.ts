import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	applyWorkspaceLaneMove,
	resolveProjectWorkspace,
	resolveSection,
} from "../../../lib/host-sections";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description: "Create a workspace on a host",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string().required().desc("Project ID"),
		name: string().required().desc("Workspace name"),
		branch: string().desc("Git branch (required unless --pr is set)"),
		pr: number().desc("PR number — checks out the verified PR head"),
		baseBranch: string().desc(
			"Branch to fork from when `branch` does not exist (defaults to project default)",
		),
		group: string().desc(
			"Workspace group (name or id) to place the new workspace in",
		),
		after: string().desc(
			"Place the new workspace directly under this workspace (name or id), inheriting its group",
		),
		agent: string().desc(
			"Agent to spawn after creation. Preset id (`claude`, `codex`, …), HostAgentConfig instance UUID, or `superset`",
		),
		prompt: string().desc(
			"Initial prompt the agent starts with. Required when --agent is set",
		),
		command: string().desc(
			"Shell command to run in the new workspace after creation",
		),
		attachment: string()
			.variadic()
			.desc(
				"Local file path to upload as an attachment to the host. Repeatable. Only used when --agent is set",
			),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		if (Boolean(options.branch) === Boolean(options.pr)) {
			throw new CLIError(
				"Specify exactly one of --branch or --pr",
				"Use --branch <name> or --pr <number>",
			);
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
		if (options.attachment && options.attachment.length > 0 && !options.agent) {
			throw new CLIError(
				"--attachment requires --agent",
				"Attachments are only meaningful when launching an agent",
			);
		}
		if (options.group && options.after) {
			throw new CLIError(
				"Cannot combine --group and --after",
				"--after places the workspace under another one, inheriting its group",
			);
		}

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const section = options.group
			? await resolveSection(target.client, options.group, options.project)
			: undefined;
		const afterWorkspace = options.after
			? await resolveProjectWorkspace(
					target.client,
					options.project,
					options.after,
				)
			: undefined;

		const attachmentIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];

		const agents =
			options.agent && options.prompt
				? [
						{
							agent: options.agent,
							prompt: options.prompt,
							...(attachmentIds.length > 0 ? { attachmentIds } : {}),
						},
					]
				: undefined;

		const result = await target.client.workspaces.create.mutate({
			projectId: options.project,
			name: options.name,
			branch: options.branch,
			pr: options.pr,
			baseBranch: options.baseBranch,
			sectionId: section?.id ?? afterWorkspace?.sectionId ?? undefined,
			agents,
			command: options.command ?? undefined,
		});

		if (afterWorkspace && !result.alreadyExists) {
			// Place the new workspace directly under `--after`, in its list.
			const [workspaces, sections] = await Promise.all([
				target.client.workspace.list.query(),
				target.client.sections.list.query(),
			]);
			await applyWorkspaceLaneMove(
				target.client,
				{ workspaces, sections },
				{
					workspaceId: result.workspace.id,
					sectionId: afterWorkspace.sectionId ?? null,
					projectId: afterWorkspace.projectId,
					target: { afterId: afterWorkspace.id },
				},
			);
		}

		return {
			data: result,
			message: result.alreadyExists
				? `Reused existing workspace "${result.workspace.name}" on host ${target.hostId}`
				: `Created workspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
