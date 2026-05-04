import { CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Launch an agent inside an existing workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		agent: string()
			.required()
			.desc("Agent preset id (e.g. claude) or instance id"),
		prompt: string().required().desc("Prompt sent to the agent"),
		attachmentId: string()
			.variadic()
			.desc("Attachment UUID; pass --attachment-id repeatedly"),
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

		const result = await target.client.agents.run.mutate({
			workspaceId: options.workspace,
			agent: options.agent,
			prompt: options.prompt,
			attachmentIds: options.attachmentId,
		});

		return {
			data: result,
			message: `Launched ${result.label} (terminal ${result.sessionId}) in workspace ${options.workspace}`,
		};
	},
});
