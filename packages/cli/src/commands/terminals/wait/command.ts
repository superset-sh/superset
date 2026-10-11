import { boolean, CLIError, number, string } from "@superset/cli-framework";
import { pollUntil } from "../../../lib/agent-wait";
import { command } from "../../../lib/command";
import { resolveWorkspaceTarget } from "../../../lib/host-workspaces";

const POLL_INTERVAL_MS = 500;

export default command({
	description: "Block until a terminal's screen matches a pattern",
	options: {
		workspace: string().required().desc("Workspace ID"),
		host: string().desc(
			"Host the workspace lives on (default: the cloud if your account has cloud workspaces, else this machine)",
		),
		local: boolean().desc("The workspace is on this machine"),
		terminal: string().required().desc("Terminal ID to watch"),
		match: string()
			.required()
			.desc("Regular expression to look for, e.g. 'listening on :\\d+'"),
		maxLines: number().int().desc("Only search this many rows from the bottom"),
		timeout: number().min(1).default(600).desc("Seconds before giving up"),
	},
	run: async ({ ctx, options, signal }) => {
		const organizationId = ctx.config.organizationId;
		if (!organizationId) {
			throw new CLIError("No active organization", "Run: superset auth login");
		}
		let pattern: RegExp;
		try {
			pattern = new RegExp(options.match, "m");
		} catch (error) {
			throw new CLIError(
				"--match is not a valid regular expression",
				String(error),
			);
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
			terminalId: options.terminal,
			workspaceId: options.workspace,
		};
		const { value } = await pollUntil({
			read: async () => {
				const [{ text }, { sessions }] = await Promise.all([
					client.terminal.snapshot.query({
						...ref,
						maxLines: options.maxLines ?? undefined,
					}),
					client.terminal.list.query({ workspaceId: options.workspace }),
				]);
				return {
					match: pattern.exec(text)?.[0],
					alive: sessions.some(
						(session) => session.terminalId === options.terminal,
					),
				};
			},
			done: ({ match, alive }) => match !== undefined || !alive,
			timeoutMs: options.timeout * 1000,
			intervalMs: POLL_INTERVAL_MS,
			signal,
		});
		// The exit can be seen after the screen was read, so read it once more
		// for output printed just before the terminal ended.
		const finalScreen = value.alive
			? null
			: await client.terminal.snapshot
					.query({ ...ref, maxLines: options.maxLines ?? undefined })
					.then((snapshot) => snapshot.text)
					.catch(() => null);
		const match =
			value.match ??
			(finalScreen === null ? undefined : pattern.exec(finalScreen)?.[0]);
		if (match !== undefined) {
			return {
				data: { terminalId: options.terminal, matched: match },
				message: match,
			};
		}
		if (!value.alive) {
			throw new CLIError(
				`Terminal ${options.terminal} exited without a match for ${options.match}`,
				"Read its last screen with `superset terminals read`",
			);
		}
		throw new CLIError(
			`Timed out after ${options.timeout}s without a match for ${options.match}`,
			"Check the screen with `superset terminals read`",
		);
	},
});
