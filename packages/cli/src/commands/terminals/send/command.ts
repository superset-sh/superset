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
	trpcErrorCode,
	waitErrorToCliError,
} from "../../../lib/terminal-agent-wait";

export default command({
	description:
		"Send a follow-up message to a terminal already running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string()
			.required()
			.desc("Terminal ID (the sessionId `agents create` returned)"),
		text: string().required().desc("Text to write into the terminal"),
		noSubmit: boolean().desc("Stage the text without pressing Enter"),
		wait: boolean().desc(
			"After sending, block until the agent's hooks report one of --until, counting only events newer than the send. Send while the agent is idle: a prompt sent mid-turn is queued, and the current turn's stop ends the wait",
		),
		until: string().desc(
			`With --wait: comma-separated statuses to stop at (default ${DEFAULT_TERMINAL_AGENT_WAIT_UNTIL.join(",")}; any of ${TERMINAL_AGENT_WAIT_STATUSES.join(", ")})`,
		),
		timeout: number()
			.int()
			.min(MIN_TERMINAL_AGENT_WAIT_TIMEOUT_MS)
			.max(MAX_TERMINAL_AGENT_WAIT_TIMEOUT_MS)
			.desc(
				`With --wait: milliseconds to wait before failing (default ${DEFAULT_TERMINAL_AGENT_WAIT_TIMEOUT_MS}; at most ${MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS} for a workspace on another machine)`,
			),
	},
	run: async ({ ctx, options, signal }) => {
		if (!options.wait && (options.until || options.timeout !== undefined)) {
			throw new CLIError(
				"--until and --timeout only apply with --wait",
				"Add --wait, or drop them and run 'superset terminals wait' afterwards",
			);
		}
		if (options.wait && options.noSubmit) {
			throw new CLIError(
				"--wait needs the text submitted",
				"Drop --no-submit: staged text starts no turn to wait for",
			);
		}
		const until = parseUntil(
			options.until ?? DEFAULT_TERMINAL_AGENT_WAIT_UNTIL.join(","),
		);
		const timeoutMs = options.timeout ?? DEFAULT_TERMINAL_AGENT_WAIT_TIMEOUT_MS;

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
		if (options.wait) assertWaitTimeoutFitsTarget(target.kind, timeoutMs);

		let result: Awaited<ReturnType<typeof target.client.terminal.send.mutate>>;
		try {
			result = await target.client.terminal.send.mutate(
				{
					terminalId: options.terminal,
					workspaceId: options.workspace,
					text: options.text,
					submit: !options.noSubmit,
					...(options.wait ? { wait: { until, timeoutMs } } : {}),
				},
				{ signal },
			);
		} catch (error) {
			if (!options.wait) throw error;
			// The host rejects a --wait on a terminal with no agent before it
			// writes anything; every other failure may come after the text
			// was staged, so only this one says nothing was sent.
			if (trpcErrorCode(error) === "PRECONDITION_FAILED") {
				throw new CLIError(
					`Nothing was sent: no agent is running in terminal ${options.terminal}`,
					"--wait needs an agent session (one that 'agents create' launched). Drop --wait to write to a plain shell",
				);
			}
			if (trpcErrorCode(error) === "TIMEOUT") {
				const waitError = waitErrorToCliError(error, {
					terminalId: options.terminal,
					until,
					timeoutMs,
				});
				if (waitError) {
					throw new CLIError(
						`The prompt was sent. ${waitError.message}`,
						"The agent may still be working. Read the terminal, or run 'superset terminals wait --after' with the lastEventAt a plain send prints",
					);
				}
			}
			throw error;
		}

		if (options.wait && !result.wait) {
			throw new CLIError(
				`The prompt was sent, but this host is too old to wait on it`,
				"Update the host, or poll with 'superset terminals read'",
			);
		}

		const sent = `Sent to terminal ${options.terminal}`;
		if (result.wait) {
			return {
				data: result,
				message: `${sent}; agent reached ${describeAgentStatus(result.wait)}`,
			};
		}
		return {
			data: result,
			message:
				typeof result.lastEventAt === "number"
					? `${sent}. Agent lastEventAt before the send: ${result.lastEventAt} (pass it to 'terminals wait --after' to wait for this prompt to settle)`
					: sent,
		};
	},
});
