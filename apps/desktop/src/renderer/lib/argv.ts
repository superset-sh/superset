import { parse, quote } from "shell-quote";

/**
 * Format a command + argv array as an editable shell-style string.
 * Round-trips through `parseCommandString` losslessly: the command
 * and every argv element are quoted (when needed) so paths with
 * spaces and explicit empty strings survive the round trip.
 */
export function joinCommandArgs(command: string, args: string[]): string {
	const tokens = command.length === 0 ? args : [command, ...args];
	if (tokens.length === 0) return "";
	return quote(tokens);
}

/**
 * Parse a shell-style string into `command` (first token) and the rest as
 * `args`. Drops control operators (`|`, `>`, etc.) — this is a launch
 * spec, not a shell invocation. Empty quoted args (`""`) and tokens with
 * embedded spaces are preserved exactly.
 */
export function parseCommandString(input: string): {
	command: string;
	args: string[];
} {
	const tokens = parse(input).filter(
		(token): token is string => typeof token === "string",
	);
	if (tokens.length === 0) return { command: "", args: [] };
	const [command, ...args] = tokens;
	return { command: command ?? "", args };
}

/** Format a bare argv array (no leading executable). */
export function joinArgs(args: string[]): string {
	if (args.length === 0) return "";
	return quote(args);
}

/**
 * Parse a bare argv array (no leading executable). Preserves empty
 * quoted args; drops only shell control operators.
 */
export function parseArgs(input: string): string[] {
	return parse(input).filter(
		(token): token is string => typeof token === "string",
	);
}

/**
 * Returns true when `input` contains shell control operators (`&&`, `||`,
 * `;`, `|`, `>`, `<`, etc.). Agent launch specs are argv, not shell
 * invocations, so operators would be silently dropped by `parseCommandString`.
 * Callers should reject the input up front instead of saving a mangled command.
 */
export function hasShellControlOperators(input: string): boolean {
	return parse(input).some((token) => typeof token !== "string");
}
