import { CLIError, string } from "@superset/cli-framework";
import type { PaneLayoutOpResult } from "@superset/shared/pane-layout-ops";
import { PANE_SPLIT_DIRECTIONS } from "@superset/shared/pane-layout-ops";
import type { HostServiceClient } from "../../lib/host-target";
import { formatLayout } from "../../lib/pane-layout-format";

export const workspaceOptions = {
	workspace: string().required().desc("Workspace ID"),
	host: string().desc("Host the workspace lives on (default: this machine)"),
};

export const directionOption = () =>
	string()
		.enum(...PANE_SPLIT_DIRECTIONS)
		.desc("Side to place the pane on: right, left, down, or up");

const OLD_HOST_MESSAGE = "This host is too old for `superset panes`";

function isOldPanesHost(error: unknown): boolean {
	return (
		error instanceof Error &&
		/No procedure found on path "?panes\./.test(error.message)
	);
}

/** Turns a host without the `panes` router into an actionable error. */
export async function callPanes<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (error) {
		if (isOldPanesHost(error)) {
			throw new CLIError(
				OLD_HOST_MESSAGE,
				"Update the Superset desktop app on that host",
			);
		}
		throw error;
	}
}

/**
 * Why the host cannot edit pane layouts at all (the host is too old, or no
 * new enough desktop app is attached), or null for any other failure.
 */
export function paneLayoutUnavailableReason(error: unknown): string | null {
	if (isOldPanesHost(error)) return OLD_HOST_MESSAGE;
	if (
		error instanceof Error &&
		(error as { data?: { code?: string } }).data?.code === "PRECONDITION_FAILED"
	) {
		return error.message;
	}
	return null;
}

export const terminalOptions = {
	terminal: string().desc("Existing terminal session to show in the new pane"),
	command: string().desc("Command to run in the new terminal"),
};

/**
 * Runs `place` with `terminal`, or with a terminal created for it. A created
 * terminal is killed if placing it fails, so no orphan session is left.
 */
export async function withPaneTerminal<T>(
	client: HostServiceClient,
	workspaceId: string,
	options: { terminal?: string | null; command?: string | null },
	place: (terminalId: string) => Promise<T>,
): Promise<T & { terminalId: string }> {
	if (options.terminal && options.command) {
		throw new CLIError(
			"--command only applies to a new terminal",
			"Drop --terminal to create one, or drop --command",
		);
	}
	const terminalId =
		options.terminal ??
		(
			await client.terminal.createSession.mutate({
				workspaceId,
				initialCommand: options.command ?? undefined,
			})
		).terminalId;
	try {
		return { ...(await callPanes(() => place(terminalId))), terminalId };
	} catch (error) {
		// A timeout is not a rejection: the desktop may still place the pane, so
		// killing the terminal would leave that pane on a dead session.
		if (isTimeout(error)) {
			throw new CLIError(
				`The desktop app did not confirm in time; terminal ${terminalId} is kept`,
				"Check with `superset panes list`; close it with `superset terminals close` if no pane shows it",
			);
		}
		if (!options.terminal) {
			await client.terminal.killSession
				.mutate({ workspaceId, terminalId })
				.catch(() => {});
		}
		throw error;
	}
}

function isTimeout(error: unknown): boolean {
	return (
		(error as { data?: { code?: string } } | null)?.data?.code === "TIMEOUT"
	);
}

export function layoutResult<T extends PaneLayoutOpResult>(
	summary: string,
	result: T,
) {
	return {
		data: result,
		message: `${summary}\n${formatLayout(result.layout)}`,
	};
}
