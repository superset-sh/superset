import { CLIError, number, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { TERMINAL_HANDOFF_MAX_CHARS } from "@superset/shared/terminal-session-handoff";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";
import { buildHandoffPromptFromTerminal } from "../../../lib/terminal-handoff";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description: "Create an agent session in an existing workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		agent: string()
			.required()
			.desc(
				"Agent preset id (e.g. `claude`), HostAgentConfig instance UUID, or `superset` for a Superset session",
			),
		prompt: string().desc(
			"Prompt sent to the agent (required unless resuming, forking, or handing off a session)",
		),
		resumeSession: string().desc(
			"Session id of a previous run of this agent to restore instead of starting fresh",
		),
		forkSession: string().desc(
			"Session id of a previous run to clone into a new provider session",
		),
		fromTerminal: string().desc(
			"Terminal ID whose recent context seeds the new session, so another agent can pick the work up",
		),
		contextChars: number()
			.int()
			.min(1)
			.max(TERMINAL_HANDOFF_MAX_CHARS)
			.desc(
				`Cap the handed-over context, 1-${TERMINAL_HANDOFF_MAX_CHARS} characters (default ${TERMINAL_HANDOFF_MAX_CHARS}, roughly 9-12k tokens)`,
			),
		model: string().desc(
			"Model for this launch (agent-specific; omit to use the agent default)",
		),
		effort: string().desc(
			"Reasoning effort for this launch (agent-specific; omit to use the agent default)",
		),
		attachmentId: string()
			.variadic()
			.desc("Pre-uploaded attachment UUID; pass --attachment-id repeatedly"),
		attachment: string()
			.variadic()
			.desc(
				"Local file path to upload as an attachment to the host. Repeatable",
			),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const sessionOperations = [
			options.resumeSession && "--resume-session",
			options.forkSession && "--fork-session",
			options.fromTerminal && "--from-terminal",
		].filter((flag): flag is string => Boolean(flag));
		if (sessionOperations.length > 1) {
			throw new CLIError(
				"Choose one session operation",
				`Pass one of ${sessionOperations.join(", ")}, not several`,
			);
		}

		if (options.fromTerminal && options.prompt) {
			throw new CLIError(
				"--from-terminal builds its own prompt",
				"Drop --prompt: the new session is seeded with the terminal's recent context",
			);
		}

		if (
			!options.prompt &&
			!options.resumeSession &&
			!options.forkSession &&
			!options.fromTerminal
		) {
			throw new CLIError(
				"Missing --prompt",
				"Pass --prompt, --resume-session, --fork-session, or --from-terminal",
			);
		}

		const hostId = options.host ?? getHostId();
		const { workspace } = await findWorkspaceOnHost(
			{ organizationId, userJwt: ctx.bearer, api: ctx.api, hostId },
			options.workspace,
		);
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on host ${hostId}: ${options.workspace}`,
				"Pass --host <id> if it lives on another machine",
			);
		}

		const target = await resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
			api: ctx.api,
		});

		const prompt = options.fromTerminal
			? await buildHandoffPromptFromTerminal(target.client, {
					workspaceId: options.workspace,
					terminalId: options.fromTerminal,
					...(options.contextChars ? { maxChars: options.contextChars } : {}),
				})
			: (options.prompt ?? "");

		const uploadedIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];
		const attachmentIds = [...(options.attachmentId ?? []), ...uploadedIds];

		const result = await target.client.agents.run.mutate({
			workspaceId: options.workspace,
			agent: options.agent,
			prompt,
			resumeSessionId: options.resumeSession,
			forkSessionId: options.forkSession,
			model: options.model,
			effort: options.effort,
			attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
		});

		return {
			data: result,
			message: options.fromTerminal
				? `Handed ${options.fromTerminal} off to ${result.label} with ${prompt.length} characters of context (terminal ${result.sessionId})`
				: `Launched ${result.label} (terminal ${result.sessionId}) in workspace ${options.workspace}`,
		};
	},
});
