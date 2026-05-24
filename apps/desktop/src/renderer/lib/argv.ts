import { parse, quote } from "shell-quote";

/**
 * Shell control operators we keep verbatim. `shell-quote.parse` returns these
 * as `{ op }` objects; we preserve them as plain strings so users can chain
 * commands (e.g. `setupEnv && codex …`) in the agent launch field.
 */
const SHELL_OPERATORS = new Set([
	"&&",
	"||",
	"|",
	";",
	";;",
	"&",
	"(",
	")",
	"<",
	">",
	">>",
	"<<",
	"<<<",
	"|&",
	">&",
]);

function isShellOperator(token: string): boolean {
	return SHELL_OPERATORS.has(token);
}

function tokenize(input: string): string[] {
	return parse(input).map((token) =>
		typeof token === "string" ? token : (token as { op: string }).op,
	);
}

function joinTokens(tokens: string[]): string {
	if (tokens.length === 0) return "";
	return tokens
		.map((token) => (isShellOperator(token) ? token : quote([token])))
		.join(" ");
}

/**
 * Format a command + argv array as an editable shell-style string.
 * Round-trips through `parseCommandString` losslessly: the command
 * and every argv element are quoted (when needed) so paths with
 * spaces and explicit empty strings survive the round trip. Shell
 * control operators like `&&` are emitted unquoted so they keep
 * acting as operators when the string is run by a shell.
 */
export function joinCommandArgs(command: string, args: string[]): string {
	const tokens = command.length === 0 ? args : [command, ...args];
	return joinTokens(tokens);
}

/**
 * Parse a shell-style string into `command` (first token) and the rest as
 * `args`. Shell control operators (`&&`, `|`, `>`, …) are preserved as
 * string tokens so they round-trip through the UI and reach the shell
 * intact. Empty quoted args (`""`) and tokens with embedded spaces are
 * preserved exactly.
 */
export function parseCommandString(input: string): {
	command: string;
	args: string[];
} {
	const tokens = tokenize(input);
	if (tokens.length === 0) return { command: "", args: [] };
	const [command, ...args] = tokens;
	return { command: command ?? "", args };
}

/** Format a bare argv array (no leading executable). */
export function joinArgs(args: string[]): string {
	return joinTokens(args);
}

/**
 * Parse a bare argv array (no leading executable). Preserves empty
 * quoted args and shell control operators.
 */
export function parseArgs(input: string): string[] {
	return tokenize(input);
}
