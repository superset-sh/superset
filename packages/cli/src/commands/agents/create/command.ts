import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findHostWorkspace } from "../../../lib/host-workspaces";
import { uploadAttachments } from "../../../lib/upload-attachments";

export default command({
	description: "Create an agent session in an existing workspace",
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

		// Workspace records are host-owned: resolve the id across the org's
		// reachable hosts.
		const { workspace, warnings } = await findHostWorkspace(
			{ api: ctx.api, organizationId, userJwt: ctx.bearer },
			options.workspace,
		);
		for (const warning of warnings) {
			process.stderr.write(`Warning: ${warning}\n`);
		}
		if (!workspace) {
			throw new CLIError(
				`Workspace not found on any reachable host: ${options.workspace}`,
			);
		}

		const target = resolveHostTarget({
			requestedHostId: workspace.hostId,
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
