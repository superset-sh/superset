import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "Close (kill) terminal sessions in a workspace",
	args: [positional("ids").required().variadic().desc("Terminal IDs")],
	options: {
		workspace: string().required().desc("Workspace ID that owns the terminals"),
		host: string().desc("Skip the cloud lookup and target this host directly"),
		local: boolean().desc("Skip the cloud lookup and target this machine"),
	},
	run: async ({ ctx, args, options }) => {
		const ids = args.ids as string[];
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}

		let hostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		if (!hostId) {
			const cloudWorkspace = await ctx.api.v2Workspace.getFromHost.query({
				organizationId,
				id: options.workspace,
			});
			if (!cloudWorkspace) {
				throw new CLIError(`Workspace not found: ${options.workspace}`);
			}
			hostId = cloudWorkspace.hostId;
		}

		const target = resolveHostTarget({
			requestedHostId: hostId,
			organizationId,
			userJwt: ctx.bearer,
		});

		const closed: string[] = [];
		for (const id of ids) {
			await target.client.terminal.killSession.mutate({
				terminalId: id,
				workspaceId: options.workspace,
			});
			closed.push(id);
		}

		const message =
			closed.length === 1
				? `Closed terminal ${closed[0]}`
				: `Closed ${closed.length} terminals`;
		return { data: { closed }, message };
	},
});
