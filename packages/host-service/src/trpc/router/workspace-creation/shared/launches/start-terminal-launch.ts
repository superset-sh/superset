import { createTerminalSessionInternal } from "../../../../../terminal/terminal";
import type { HostServiceContext } from "../../../../../types";
import type { TerminalLaunchPlan } from "./build-agent-launch";

export interface StartTerminalLaunchInput {
	ctx: HostServiceContext;
	workspaceId: string;
	plan: TerminalLaunchPlan;
}

export interface StartedTerminalLaunch {
	terminalId: string;
	label: string;
}

/**
 * Spawns the agent in a workspace terminal session and returns the
 * resulting terminal id. Composes a shell-string from `plan.spawn`
 * (POSIX-quoted argv) and passes it to `createTerminalSessionInternal`
 * as `initialCommand`. Stdin-transport prompts get prepended as
 * `printf '%s' '<prompt>' | <command>` so the prompt reaches the
 * spawned process via stdin without leaving it in argv.
 *
 * Env vars on `plan.spawn.env` are currently ignored — all builtin
 * presets seed `env: {}`. Add support if a future preset needs it.
 */
export async function startTerminalLaunch(
	input: StartTerminalLaunchInput,
): Promise<StartedTerminalLaunch | { error: string }> {
	const { ctx, workspaceId, plan } = input;

	const argv = [plan.spawn.command, ...plan.spawn.args].map(shellQuote);
	let initialCommand = argv.join(" ");
	if (plan.stdinPrompt) {
		initialCommand = `printf '%s' ${shellQuote(plan.stdinPrompt)} | ${initialCommand}`;
	}

	const terminalId = crypto.randomUUID();
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db: ctx.db,
		eventBus: ctx.eventBus,
		initialCommand,
	});
	if ("error" in result) return { error: result.error };

	return { terminalId, label: plan.label };
}

/** POSIX single-quote escape: safe for any value passed through a shell. */
function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
