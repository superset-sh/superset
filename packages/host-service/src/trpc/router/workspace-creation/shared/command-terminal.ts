import { createTerminalSessionInternal } from "../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../types";
import type { TerminalDescriptor } from "./types";

interface StartCommandTerminalArgs {
	ctx: HostServiceContext;
	workspaceId: string;
	command: string;
}

interface StartCommandTerminalResult {
	terminal: TerminalDescriptor | null;
	warning: string | null;
}

/**
 * Start a terminal session that runs an arbitrary command in the workspace
 * worktree. Mirrors the setup terminal, but the command is supplied by the
 * caller (the CLI `--command` flag) instead of resolved from config.
 */
export async function startCommandTerminal(
	args: StartCommandTerminalArgs,
): Promise<StartCommandTerminalResult> {
	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: args.workspaceId,
		db: args.ctx.db,
		eventBus: args.ctx.eventBus,
		initialCommand: args.command,
	});
	if ("error" in result) {
		return {
			terminal: null,
			warning: `Failed to start command terminal: ${result.error}`,
		};
	}

	return {
		terminal: { id: terminalId, role: "command", label: "Command" },
		warning: null,
	};
}
