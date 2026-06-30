import { boolean, CLIError, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description:
		"Send a follow-up message to a terminal already running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		terminal: string()
			.required()
			.desc("Terminal ID (the sessionId agents create returned)"),
		text: string().required().desc("Text to write into the terminal"),
		noSubmit: boolean().desc("Stage the text without pressing Enter"),
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

		const result = await target.client.terminal.send.mutate({
			terminalId: options.terminal,
			text: options.text,
			submit: !options.noSubmit,
		});

		return {
			data: result,
			message: `Sent to terminal ${options.terminal}`,
		};
	},
});
