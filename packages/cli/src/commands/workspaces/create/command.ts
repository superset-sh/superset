import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { deriveBranchName } from "@superset/shared/workspace-launch";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description: "Create a workspace on a host",
	options: {
		host: string().desc("Target host machineId"),
		local: boolean().desc("Target this machine"),
		project: string().required().desc("Project ID"),
		name: string().desc(
			"Workspace name (defaults to the derived branch name when --issue is set)",
		),
		branch: string().desc(
			"Git branch (use exactly one of --branch | --pr | --issue)",
		),
		pr: number().desc("PR number — derives branch via gh pr checkout"),
		issue: number().desc(
			"GitHub issue number — derives branch from `issue-<num>` + issue title",
		),
		baseBranch: string().desc(
			"Branch to fork from when `branch` does not exist (defaults to project default)",
		),
		agent: string().desc(
			"Agent to spawn after creation. Preset id (`claude`, `codex`, …), HostAgentConfig instance UUID, or `superset`",
		),
		prompt: string().desc(
			"Initial prompt the agent starts with. Required when --agent is set, unless --issue is also set (then defaults to issue title + body + URL)",
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

		const sourceCount =
			(options.branch ? 1 : 0) + (options.pr ? 1 : 0) + (options.issue ? 1 : 0);
		if (sourceCount !== 1) {
			throw new CLIError(
				"Specify exactly one of --branch, --pr, or --issue",
				"Use --branch <name>, --pr <number>, or --issue <number>",
			);
		}

		if (options.prompt && !options.agent) {
			throw new CLIError(
				"--prompt requires --agent",
				"Pass --agent <id> alongside --prompt",
			);
		}
		if (options.agent && !options.prompt && !options.issue) {
			throw new CLIError(
				"--agent requires --prompt",
				"Pass --prompt <text>, or use --issue <num> to default the prompt to the issue",
			);
		}
		if (options.attachment && options.attachment.length > 0 && !options.agent) {
			throw new CLIError(
				"--attachment requires --agent",
				"Attachments are only meaningful when launching an agent",
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

		let resolvedBranch = options.branch;
		let resolvedName = options.name;
		let resolvedPrompt = options.prompt;

		if (options.issue) {
			const issue = await target.client.workspaceCreation.getIssue.query({
				projectId: options.project,
				issueNumber: options.issue,
			});
			resolvedBranch = deriveBranchName({
				slug: `issue-${issue.issueNumber}`,
				title: issue.title,
			});
			if (!resolvedName) {
				resolvedName = resolvedBranch;
			}
			if (options.agent && !resolvedPrompt) {
				resolvedPrompt = `${issue.title}\n\n${issue.body}\n\n${issue.url}`;
			}
		}

		const attachmentIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];

		const agents =
			options.agent && resolvedPrompt
				? [
						{
							agent: options.agent,
							prompt: resolvedPrompt,
							...(attachmentIds.length > 0 ? { attachmentIds } : {}),
						},
					]
				: undefined;

		const result = await target.client.workspaces.create.mutate({
			projectId: options.project,
			name: resolvedName,
			branch: resolvedBranch,
			pr: options.pr,
			baseBranch: options.baseBranch,
			agents,
		});

		return {
			data: result,
			message: result.alreadyExists
				? `Reused existing workspace "${result.workspace.name}" on host ${target.hostId}`
				: `Created workspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
