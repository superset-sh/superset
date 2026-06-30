import { boolean, CLIError, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveHostFilter, resolveHostTarget } from "../../../lib/host-target";

export default command({
	description: "List terminal sessions in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Skip the cloud lookup and target this host directly"),
		local: boolean().desc("Skip the cloud lookup and target this machine"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["terminalId", "title", "status", "attached", "createdAt"],
			["ID", "TITLE", "STATUS", "ATTACHED", "CREATED"],
			// Full UUID width for the ID column — never truncate terminal IDs.
			[36, 30, 16, 8, 24],
		),
	run: async ({ ctx, options }) => {
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

		const { sessions } = await target.client.terminal.listSessions.query({
			workspaceId: options.workspace,
		});

		return sessions.map((session) => ({
			...session,
			// `id` mirrors `terminalId` so `--quiet` prints bare terminal IDs.
			id: session.terminalId,
			status: session.exited ? `exited (${session.exitCode})` : "active",
			createdAt: new Date(session.createdAt).toISOString(),
		}));
	},
});
