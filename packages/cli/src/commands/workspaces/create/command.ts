import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { requireHostTarget, resolveHostTarget } from "../../../lib/host-target";
import { uploadAttachments } from "../../../lib/upload-attachments";
import { assertRequestedAgentsStarted } from "./agent-results";

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
		agent: string().desc(
			"Agent to spawn after creation. Preset id (`claude`, `codex`, …), HostAgentConfig instance UUID, or `superset`",
		),
		prompt: string().desc(
			"Initial prompt the agent starts with. Required when --agent is set",
		),
		command: string().desc(
			"Shell command to run in the new workspace after creation",
		),
		strict: boolean().desc(
			"Exit non-zero if the requested agent fails to launch (default: warn on stderr, exit 0)",
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

		const hostId = requireHostTarget({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

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
			agents,
			command: options.command ?? undefined,
		});
		assertRequestedAgentsStarted(result, agents?.length ?? 0);

		// The server keeps the workspace even when an agent fails to launch,
		// mapping each failure to `{ ok: false, error }` in `agents[]` rather
		// than rolling back. Surface those failures loudly: the caller asked
		// for an agent, and a created-but-agentless workspace is not the
		// requested outcome. Without this the CLI printed only the success
		// message and the failure was visible solely in the --json payload.
		const failedAgents = (result.agents ?? []).filter(
			(entry): entry is { ok: false; error: string } => entry.ok === false,
		);
		if (failedAgents.length > 0) {
			const detail = failedAgents.map((entry) => entry.error).join("; ");
			if (options.strict) {
				throw new CLIError(
					`Agent launch failed: ${detail}`,
					"The workspace was created but the agent did not start. Re-run the agent, or drop --strict to treat this as a warning.",
				);
			}
			for (const entry of failedAgents) {
				process.stderr.write(`warning: agent launch failed: ${entry.error}\n`);
			}
		}

		return {
			data: result,
			message: result.alreadyExists
				? `Reused existing workspace "${result.workspace.name}" on host ${target.hostId}`
				: `Created workspace "${result.workspace.name}" on host ${target.hostId}`,
		};
	},
});
