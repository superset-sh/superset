import { parse } from "shell-quote";

const SAFE_SHELL_TOKEN = /^[A-Za-z0-9_@%+=:,./~-]+$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

function quoteShellToken(value: string): string {
	if (value === "") return "''";
	if (SAFE_SHELL_TOKEN.test(value)) return value;
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseTokens(input: string): string[] {
	return parse(input).filter(
		(token): token is string => typeof token === "string",
	);
}

function splitLeadingEnvAssignments(tokens: string[]): {
	env: Record<string, string>;
	rest: string[];
} {
	const env: Record<string, string> = {};
	let firstCommandIndex = 0;

	for (const token of tokens) {
		const equalsIndex = token.indexOf("=");
		const key = token.slice(0, equalsIndex);
		if (equalsIndex <= 0 || !ENV_KEY.test(key)) break;

		env[key] = token.slice(equalsIndex + 1);
		firstCommandIndex += 1;
	}

	return { env, rest: tokens.slice(firstCommandIndex) };
}

/**
 * Format a command + argv array as an editable shell-style string.
 * Round-trips through `parseCommandString` losslessly: the command
 * and every argv element are quoted (when needed) so paths with
 * spaces and explicit empty strings survive the round trip.
 */
export function joinCommandArgs(command: string, args: string[]): string {
	const tokens = command.length === 0 ? args : [command, ...args];
	if (tokens.length === 0) return "";
	return tokens.map(quoteShellToken).join(" ");
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
	const tokens = parseTokens(input);
	if (tokens.length === 0) return { command: "", args: [] };
	const [command, ...args] = tokens;
	return { command: command ?? "", args };
}

/** Format a bare argv array (no leading executable). */
export function joinArgs(args: string[]): string {
	if (args.length === 0) return "";
	return args.map(quoteShellToken).join(" ");
}

/**
 * Parse a bare argv array (no leading executable). Preserves empty
 * quoted args; drops only shell control operators.
 */
export function parseArgs(input: string): string[] {
	return parseTokens(input);
}

export function parseLaunchCommandString(input: string): {
	command: string;
	args: string[];
	env: Record<string, string>;
} {
	const { env, rest } = splitLeadingEnvAssignments(parseTokens(input));
	if (rest.length === 0) return { command: "", args: [], env };

	const [command, ...args] = rest;
	return { command: command ?? "", args, env };
}

function joinEnvAssignments(env: Record<string, string>): string {
	return Object.entries(env)
		.filter(([key]) => ENV_KEY.test(key))
		.map(([key, value]) => `${key}=${quoteShellToken(value)}`)
		.join(" ");
}

export function joinCommandArgsWithEnv(
	command: string,
	args: string[],
	env: Record<string, string> = {},
): string {
	const tokens = command.length === 0 ? args : [command, ...args];
	const { env: inlineEnv, rest } = splitLeadingEnvAssignments(tokens);
	const [normalizedCommand = "", ...normalizedArgs] = rest;
	const envPrefix = joinEnvAssignments({ ...inlineEnv, ...env });
	const commandText = joinCommandArgs(normalizedCommand, normalizedArgs);

	if (!envPrefix) return commandText;
	if (!commandText) return envPrefix;
	return `${envPrefix} ${commandText}`;
}
