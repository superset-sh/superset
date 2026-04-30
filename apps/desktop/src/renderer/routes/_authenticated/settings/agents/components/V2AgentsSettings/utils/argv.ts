import { parse, quote } from "shell-quote";

/**
 * Format a command + argv array as an editable shell-style string.
 * Round-trips through `parseCommandString` for human-authored values.
 */
export function joinCommandArgs(command: string, args: string[]): string {
	if (args.length === 0) return command;
	return `${command} ${quote(args)}`;
}

/**
 * Parse a shell-style string into `command` (first token) and the rest as
 * `args`. Drops control operators (`|`, `>`, etc.) — this is a launch
 * spec, not a shell invocation.
 */
export function parseCommandString(input: string): {
	command: string;
	args: string[];
} {
	const tokens = parse(input)
		.filter((token): token is string => typeof token === "string")
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
	if (tokens.length === 0) return { command: "", args: [] };
	const [command, ...args] = tokens;
	return { command, args };
}

/** Format a bare argv array (no leading executable). */
export function joinArgs(args: string[]): string {
	if (args.length === 0) return "";
	return quote(args);
}

/** Parse a bare argv array (no leading executable). */
export function parseArgs(input: string): string[] {
	return parse(input)
		.filter((token): token is string => typeof token === "string")
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
}
