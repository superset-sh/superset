import { boolean, string, table } from "@superset/cli-framework";
import { command } from "../../../../lib/command";
import { listHostAgentSessions } from "../../../../lib/host-agent-sessions";
import { resolveHostFilter } from "../../../../lib/host-target";
import { printWarnings, requireOrganizationId } from "../shared";

export default command({
	description: "List running terminal-agent sessions",
	options: {
		host: string().desc("Filter to a specific host (machineId)"),
		local: boolean().desc("Filter to this machine"),
		workspace: string().desc("Filter to a workspace id"),
	},
	display: (data) =>
		table(
			data as Record<string, unknown>[],
			["status", "agent", "workspaceId", "host", "lastEventAt", "sessionId"],
			["STATUS", "AGENT", "WORKSPACE", "HOST", "LAST EVENT", "SESSION ID"],
			[12, 18, 36, 24, 24, 36],
		),
	run: async ({ ctx, options }) => {
		const organizationId = requireOrganizationId(ctx);
		const hostId = resolveHostFilter({
			host: options.host ?? undefined,
			local: options.local ?? undefined,
		});
		const { matches, warnings } = await listHostAgentSessions({
			api: ctx.api,
			organizationId,
			userJwt: ctx.bearer,
			...(hostId ? { hostId } : {}),
		});
		printWarnings(warnings);
		return matches
			.filter(
				({ session }) =>
					!options.workspace || session.workspaceId === options.workspace,
			)
			.map(({ session, hostId: resolvedHostId, hostName }) => ({
				status: session.status,
				agent: session.definitionId ?? session.agentId,
				workspaceId: session.workspaceId,
				host: hostName,
				hostId: resolvedHostId,
				lastEventAt: new Date(session.lastEventAt).toISOString(),
				sessionId: session.terminalId,
			}));
	},
});
