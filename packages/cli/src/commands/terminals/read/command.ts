import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";

export default command({
	description: "Read a terminal's current screen back as text",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string().required().desc("Terminal ID to read"),
		maxLines: number().int().desc("Cap returned rows from the bottom"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		const { target } = await resolveWorkspaceTarget(
			{
				organizationId,
				userJwt: ctx.bearer,
				api: ctx.api,
				host: options.host ?? undefined,
				local: options.local ?? undefined,
			},
			options.workspace,
		);

		const result = await target.client.terminal.snapshot.query({
			terminalId: options.terminal,
			workspaceId: options.workspace,
			maxLines: options.maxLines ?? undefined,
		});

		return {
			data: result,
			message: result.text,
		};
	},
});
