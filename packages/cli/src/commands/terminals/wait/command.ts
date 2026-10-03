import { boolean, CLIError, number, string } from "@superset/cli-framework";
import {
	DEFAULT_TERMINAL_AGENT_WAIT_TIMEOUT_MS,
	DEFAULT_TERMINAL_AGENT_WAIT_UNTIL,
	MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS,
	MAX_TERMINAL_AGENT_WAIT_TIMEOUT_MS,
	TERMINAL_AGENT_WAIT_STATUSES,
} from "@superset/shared/terminal-agent-wait";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import {
	assertWaitTimeoutFitsTarget,
	describeAgentStatus,
	MIN_TERMINAL_AGENT_WAIT_TIMEOUT_MS,
	parseUntil,
	waitErrorToCliError,
} from "../../../lib/terminal-agent-wait";

export default command({
	description:
		"Block until a terminal's agent reaches one of the given statuses, as reported by its hooks",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string()
			.required()
			.desc("Terminal ID (the sessionId `agents create` returned)"),
		until: string()
			.default(DEFAULT_TERMINAL_AGENT_WAIT_UNTIL.join(","))
			.desc(
				`Comma-separated statuses to stop at: ${TERMINAL_AGENT_WAIT_STATUSES.join(", ")}`,
			),
		timeout: number()
			.int()
			.min(MIN_TERMINAL_AGENT_WAIT_TIMEOUT_MS)
			.max(MAX_TERMINAL_AGENT_WAIT_TIMEOUT_MS)
			.default(DEFAULT_TERMINAL_AGENT_WAIT_TIMEOUT_MS)
			.desc(
				`Milliseconds to wait before failing (default ${DEFAULT_TERMINAL_AGENT_WAIT_TIMEOUT_MS}). The request is held open the whole time; a workspace on another machine allows at most ${MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS}, so loop on timeout`,
			),
		after: number()
			.int()
			.min(0)
			.desc(
				"Count only hook events newer than this timestamp: the lastEventAt that `terminals send` printed. Without it, a status that already matches returns at once",
			),
	},
	run: async ({ ctx, options, signal }) => {
		const until = parseUntil(options.until);

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
		assertWaitTimeoutFitsTarget(target.kind, options.timeout);

		try {
			const result = await target.client.terminalAgents.wait.mutate(
				{
					workspaceId: options.workspace,
					terminalId: options.terminal,
					until,
					timeoutMs: options.timeout,
					after: options.after ?? undefined,
				},
				{ signal },
			);
			return {
				data: result,
				message: `Terminal ${options.terminal} reached ${describeAgentStatus(result)}`,
			};
		} catch (error) {
			throw (
				waitErrorToCliError(error, {
					terminalId: options.terminal,
					until,
					timeoutMs: options.timeout,
				}) ?? error
			);
		}
	},
});
