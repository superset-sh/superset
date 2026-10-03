import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";
import {
	abortableSleep,
	WaitForOutputTimeoutError,
	waitForOutputMatch,
} from "../../../lib/wait-for-output";

const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 600_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_POLL_INTERVAL_MS = 200;
const MAX_POLL_INTERVAL_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

export default command({
	description:
		"Block until a terminal's visible screen matches a pattern: a test watcher, a server, any process. For an agent's status use `terminals wait`",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string().required().desc("Terminal ID to watch"),
		regex: string()
			.required()
			.desc(
				"JavaScript regular expression matched against the screen on every poll, including text already on it, so make it specific to the run you are waiting for",
			),
		maxLines: number()
			.int()
			.min(1)
			.desc("Match only the bottom N rows of the screen"),
		timeout: number()
			.int()
			.min(MIN_TIMEOUT_MS)
			.max(MAX_TIMEOUT_MS)
			.default(DEFAULT_TIMEOUT_MS)
			.desc(
				`Milliseconds to wait before failing (default ${DEFAULT_TIMEOUT_MS})`,
			),
		pollInterval: number()
			.int()
			.min(MIN_POLL_INTERVAL_MS)
			.max(MAX_POLL_INTERVAL_MS)
			.default(DEFAULT_POLL_INTERVAL_MS)
			.desc(
				`Milliseconds between screen reads (default ${DEFAULT_POLL_INTERVAL_MS})`,
			),
	},
	run: async ({ ctx, options, signal }) => {
		let regex: RegExp;
		try {
			regex = new RegExp(options.regex);
		} catch (error) {
			throw new CLIError(
				`--regex: invalid regular expression "${options.regex}"`,
				error instanceof Error ? error.message : String(error),
			);
		}

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

		try {
			const { text, match } = await waitForOutputMatch(
				{
					readText: async (readSignal) => {
						const snapshot = await target.client.terminal.snapshot.query(
							{
								terminalId: options.terminal,
								workspaceId: options.workspace,
								maxLines: options.maxLines ?? undefined,
							},
							{ signal: readSignal },
						);
						return snapshot.text;
					},
					sleep: abortableSleep,
				},
				{
					regex,
					timeoutMs: options.timeout,
					pollIntervalMs: options.pollInterval,
					signal,
				},
			);

			return {
				data: { terminalId: options.terminal, matched: true, match, text },
				message: `Matched "${match}" in terminal ${options.terminal}`,
			};
		} catch (error) {
			if (error instanceof WaitForOutputTimeoutError) {
				const hostFlag = options.host
					? ` --host ${options.host}`
					: options.local
						? " --local"
						: "";
				throw new CLIError(
					error.message,
					`Run 'superset terminals read --workspace ${options.workspace} --terminal ${options.terminal}${hostFlag}' to see the current screen`,
				);
			}
			throw error;
		}
	},
});
