import { CLIError, number, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveHostTarget } from "../../../lib/host-target";
import { findWorkspaceOnHost } from "../../../lib/host-workspaces";
import {
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
		"Block until a terminal's visible output matches a pattern — for a test watcher, server, or any process, not agent lifecycle status (see: terminals wait)",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc("Host the workspace lives on (default: this machine)"),
		terminal: string().required().desc("Terminal ID to watch"),
		regex: string()
			.required()
			.desc(
				"JS regular expression to match against the terminal's visible text",
			),
		maxLines: number().int().desc("Cap the screen read to the bottom N lines"),
		timeout: number()
			.int()
			.min(MIN_TIMEOUT_MS)
			.max(MAX_TIMEOUT_MS)
			.default(DEFAULT_TIMEOUT_MS)
			.desc(
				`Max time to wait, in milliseconds (default ${DEFAULT_TIMEOUT_MS})`,
			),
		pollInterval: number()
			.int()
			.min(MIN_POLL_INTERVAL_MS)
			.max(MAX_POLL_INTERVAL_MS)
			.default(DEFAULT_POLL_INTERVAL_MS)
			.desc(
				`How often to re-check, in milliseconds (default ${DEFAULT_POLL_INTERVAL_MS})`,
			),
	},
	run: async ({ ctx, options }) => {
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

		try {
			const { text, match } = await waitForOutputMatch(
				{
					readText: async () => {
						const result = await target.client.terminal.snapshot.query({
							terminalId: options.terminal,
							workspaceId: options.workspace,
							maxLines: options.maxLines ?? undefined,
						});
						return result.text;
					},
					sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
				},
				{
					regex,
					timeoutMs: options.timeout,
					pollIntervalMs: options.pollInterval,
				},
			);

			return {
				data: { terminalId: options.terminal, matched: true, match, text },
				message: `Matched "${match}"`,
			};
		} catch (error) {
			if (error instanceof WaitForOutputTimeoutError) {
				throw new CLIError(
					error.message,
					`Run 'superset terminals read --workspace ${options.workspace} --terminal ${options.terminal}' to see the current screen.`,
				);
			}
			throw error;
		}
	},
});
