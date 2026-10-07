import {
	createInitialCommandDelivery,
	createTerminalSessionInternal,
} from "../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../types";
import { acquireExpectedGitlabDelivery } from "../../git/gitlab-actions";
import { toTerminalSessionError } from "../../terminal/errors";
import type { ExpectedGitlabBoundDelivery } from "../../workspaces/create-gitlab-checkout";
import { settleInitialDelivery } from "./settle-initial-delivery";
import type { TerminalDescriptor } from "./types";

interface StartCommandTerminalArgs {
	expectedDelivery?: ExpectedGitlabBoundDelivery;
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
	const bound = args.expectedDelivery;
	const delivery = bound
		? createInitialCommandDelivery(() =>
				acquireExpectedGitlabDelivery(
					args.ctx,
					args.workspaceId,
					bound.expectedPullRequest,
					bound.initialWorkspace,
				),
			)
		: undefined;
	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId: args.workspaceId,
		db: args.ctx.db,
		eventBus: args.ctx.eventBus,
		...(delivery ? { initialDelivery: delivery } : {}),
		initialCommand: args.command,
	});
	if ("error" in result) {
		if (delivery) throw toTerminalSessionError(result);
		return {
			terminal: null,
			warning: `Failed to start command terminal: ${result.error}`,
		};
	}

	if (delivery) {
		await settleInitialDelivery(delivery, terminalId, args.ctx.db);
	}
	return {
		terminal: { id: terminalId, role: "command", label: "Command" },
		warning: null,
	};
}
