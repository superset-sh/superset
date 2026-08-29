import { CLIError, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";

/** Flatten the nested agent block so every value gets its own labelled row. */
function toRows(session: {
	terminalId: string;
	workspaceId: string;
	terminalStatus: string | null;
	agent: object | null;
}): Array<[string, unknown]> {
	const rows: Array<[string, unknown]> = [
		["terminalId", session.terminalId],
		["workspaceId", session.workspaceId],
		["terminalStatus", session.terminalStatus],
	];
	if (!session.agent) {
		rows.push(["agent", "— no agent bound to this terminal"]);
		return rows;
	}
	for (const [key, value] of Object.entries(session.agent)) {
		rows.push([`agent.${key}`, value]);
	}
	return rows;
}

export default command({
	description: "Show the agent session bound to a terminal, live or ended",
	options: {
		workspace: string().required().desc("Workspace ID"),
		terminal: string().required().desc("Terminal ID to inspect"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
	},
	run: async ({ ctx, options }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
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

		const session = await target.client.terminalAgents.get.query({
			workspaceId: options.workspace,
			terminalId: options.terminal,
		});

		const rows = toRows(session);
		const width = Math.max(...rows.map(([key]) => key.length));
		const message = rows
			.map(([key, value]) => {
				const shown = value === null || value === undefined ? "—" : value;
				return `${key.padEnd(width)}  ${shown}`;
			})
			.join("\n");

		return { data: session, message };
	},
});
