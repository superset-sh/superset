import { existsSync } from "node:fs";
import { join } from "node:path";
import { createTerminalSessionInternal } from "../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../types";
import type { TerminalDescriptor } from "./types";

export function startSetupTerminalIfPresent(args: {
	ctx: HostServiceContext;
	workspaceId: string;
	worktreePath: string;
}): { terminal: TerminalDescriptor | null; warning: string | null } {
	const setupScriptPath = join(args.worktreePath, ".superset", "setup.sh");
	if (!existsSync(setupScriptPath)) {
		return { terminal: null, warning: null };
	}

	const terminalId = crypto.randomUUID();
	const result = createTerminalSessionInternal({
		terminalId,
		workspaceId: args.workspaceId,
		db: args.ctx.db,
		eventBus: args.ctx.eventBus,
		initialCommand: `bash ${singleQuote(setupScriptPath)}`,
	});
	if ("error" in result) {
		return {
			terminal: null,
			warning: `Failed to start setup terminal: ${result.error}`,
		};
	}

	return {
		terminal: {
			id: terminalId,
			role: "setup",
			label: "Workspace Setup",
		},
		warning: null,
	};
}

/** POSIX single-quote escape: safe for any path passed through a shell. */
function singleQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
