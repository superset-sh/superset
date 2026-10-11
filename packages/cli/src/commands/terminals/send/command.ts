import { boolean, CLIError, number, string } from "@superset/cli-framework";
import {
	clearAgentStatusAfterInterrupt,
	observeAgent,
	waitForAgent,
} from "../../../lib/agent-binding";
import { AGENT_WAIT_TARGETS, agentWaitState } from "../../../lib/agent-wait";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import { INTERRUPT_KEYS, parseTerminalKeys } from "../../../lib/terminal-keys";

export default command({
	description:
		"Send a follow-up message or raw key presses to a terminal already running in a workspace",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string()
			.required()
			.desc("Terminal ID (the sessionId `agents create` returned)"),
		text: string().desc("Text to write into the terminal"),
		noSubmit: boolean().desc("Stage the text without pressing Enter"),
		keys: string().desc(
			"Comma-separated key presses instead of text: a single character, esc, enter, tab, shift+tab, arrows, f1-f12, ctrl+<letter>, alt+<key>",
		),
		wait: boolean().desc(
			"Block until the agent in the terminal reacts and reaches --until",
		),
		until: string()
			.enum(...AGENT_WAIT_TARGETS)
			.default("settled")
			.desc(
				"With --wait: settled (finished its turn or needs input), idle, blocked, or working",
			),
		timeout: number().min(1).default(600).desc("With --wait: seconds"),
	},
	run: async ({ ctx, options, signal }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		if ((options.text === undefined) === (options.keys === undefined)) {
			throw new CLIError("Pass exactly one of --text or --keys");
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
		const client = target.client;
		const ref = {
			workspaceId: options.workspace,
			terminalId: options.terminal,
		};

		const before = options.wait
			? (await observeAgent(client, ref)).binding
			: undefined;
		if (options.wait && !before) {
			throw new CLIError(
				`No agent is running in terminal ${options.terminal}`,
				"--wait follows an agent's state; for a plain shell use `superset terminals wait --match`",
			);
		}

		let sent: { terminalId: string; submitted?: boolean; keys?: number };
		let interrupted = false;
		if (options.keys !== undefined) {
			const keys = parseTerminalKeys(options.keys);
			interrupted = keys.some((bytes) => INTERRUPT_KEYS.has(bytes));
			for (const data of keys) {
				await client.terminal.writeInput.mutate({ ...ref, data });
			}
			await clearAgentStatusAfterInterrupt(client, ref, keys);
			sent = { terminalId: options.terminal, keys: keys.length };
		} else {
			sent = await client.terminal.send.mutate({
				...ref,
				text: options.text ?? "",
				submit: !options.noSubmit,
			});
		}

		if (!before) {
			return { data: sent, message: `Sent to terminal ${options.terminal}` };
		}
		const { observation, timedOut, stalled } = await waitForAgent({
			signal,
			client,
			ref,
			until: options.until,
			timeoutMs: options.timeout * 1000,
			// The interrupt clears the status without a new hook event, so the
			// state it leaves is the answer.
			after: interrupted ? undefined : before.lastEventAt,
		});
		const state = agentWaitState(observation);
		if (stalled) {
			throw new CLIError(
				`The agent showed no activity within 10s of the send; it is ${state}`,
				"The text may be sitting in its input box: check with `superset terminals read`",
			);
		}
		if (state === "exited") {
			throw new CLIError(
				`The agent in terminal ${options.terminal} is no longer running`,
			);
		}
		if (timedOut) {
			throw new CLIError(
				`Timed out after ${options.timeout}s; agent is ${state}`,
				"Raise --timeout, or check it with `superset terminals read`",
			);
		}
		return {
			data: { ...sent, state },
			message: `Sent to terminal ${options.terminal}; agent is ${state}`,
		};
	},
});
