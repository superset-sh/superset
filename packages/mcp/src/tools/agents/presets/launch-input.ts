import { tokenizeAgentCommand } from "@superset/shared/host-agent-presets";

export interface LaunchInput {
	command?: string;
	args?: string[];
	launchCommand?: string;
}

export interface ResolvedLaunch {
	command: string;
	args: string[];
}

/**
 * Collapse the two ways a caller can describe how an agent launches into the
 * single `command` + `args` pair the host stores.
 *
 * Structured `command` + `args` is the primary shape. `launchCommand` mirrors
 * the CLI's `--command`: one whitespace-separated launch line, split into
 * binary and args, for a caller that has a command line rather than an argv
 * array. Both at once would make the winner arbitrary, so it is rejected.
 *
 * Returns undefined when the caller supplied neither — `edit` reads that as
 * "leave the launch settings alone", `add` rejects it.
 */
export function resolveLaunch(input: LaunchInput): ResolvedLaunch | undefined {
	const hasStructured = input.command !== undefined || input.args !== undefined;
	if (input.launchCommand !== undefined && hasStructured) {
		throw new Error(
			"Pass either command (with optional args) or launchCommand, not both.",
		);
	}

	if (input.launchCommand !== undefined) {
		const [command, ...args] = tokenizeAgentCommand(input.launchCommand);
		if (!command) throw new Error("launchCommand is empty");
		return { command, args };
	}

	if (input.command === undefined) {
		// `args` alone has no binary to attach to. Command and args always
		// replace each other as a pair, so that the stored launch line can
		// never be half of one caller's intent and half of an earlier one's.
		if (input.args !== undefined) {
			throw new Error("args must be passed together with command.");
		}
		return undefined;
	}

	const command = input.command.trim();
	if (!command) throw new Error("command is empty");
	return { command, args: input.args ?? [] };
}
