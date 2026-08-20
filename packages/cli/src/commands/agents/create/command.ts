import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";
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
			"Prompt sent to the agent (required unless --resume-session is set)",
		),
		resumeSession: string().desc(
			"Session id of a previous run of this agent to restore instead of starting fresh",
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

		if (!options.prompt && !options.resumeSession) {
			throw new CLIError(
				"Missing --prompt",
				"Pass --prompt, or --resume-session to restore a previous session",
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

		const uploadedIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];
		const attachmentIds = [...(options.attachmentId ?? []), ...uploadedIds];

		const result = await target.client.agents.run.mutate({
			workspaceId: options.workspace,
			agent: options.agent,
			prompt: options.prompt ?? "",
			resumeSessionId: options.resumeSession,
			effort: options.effort,
			attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
		});

		return {
			data: result,
			message: `Launched ${result.label} (terminal ${result.sessionId}) in workspace ${options.workspace}`,
		};
	},
});
