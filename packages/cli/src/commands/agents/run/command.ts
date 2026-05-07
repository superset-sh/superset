import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description: "Launch an agent inside an existing workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		agent: string()
			.required()
			.desc(
				"Agent preset id (e.g. `claude`), HostAgentConfig instance UUID, or `superset` for a Superset session",
			),
		prompt: string().required().desc("Prompt sent to the agent"),
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

		const cloudWorkspace = await ctx.api.v2Workspace.getFromHost.query({
			organizationId,
			id: options.workspace,
		});
		if (!cloudWorkspace) {
			throw new CLIError(`Workspace not found: ${options.workspace}`);
		}

		const target = resolveHostTarget({
			requestedHostId: cloudWorkspace.hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const uploadedIds = options.attachment
			? await uploadAttachments(target.client, options.attachment)
			: [];
		const attachmentIds = [...(options.attachmentId ?? []), ...uploadedIds];

		const result = await target.client.agents.run.mutate({
			workspaceId: options.workspace,
			agent: options.agent,
			prompt: options.prompt,
			attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
		});

		const sessionDescriptor =
			result.kind === "chat"
				? `chat session ${result.sessionId}`
				: `terminal ${result.sessionId}`;
		return {
			data: result,
			message: `Launched ${result.label} (${sessionDescriptor}) in workspace ${options.workspace}`,
		};
	},
});
