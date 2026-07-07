import { CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Read a terminal's current screen back as text",
	options: {
		workspace: string().required().desc("Workspace ID"),
		terminal: string().required().desc("Terminal ID to read"),
		maxLines: number().int().desc("Cap returned rows from the bottom"),
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

		const result = await target.client.terminal.snapshot.query({
			terminalId: options.terminal,
			maxLines: options.maxLines ?? undefined,
		});

		return {
			data: result,
			message: result.text,
		};
	},
});
