/**
 * Prompt transports define the small set of ways a CLI can receive prompt
 * payloads. Keep this enum intentionally small and add a new transport only
 * when a real agent requires it. Avoid arbitrary per-agent shell templates.
 */
export const PROMPT_TRANSPORTS = ["argv", "stdin"] as const;

export type PromptTransport = (typeof PROMPT_TRANSPORTS)[number];

/**
 * Launch lines are typed into the user's interactive shell, so they must parse
 * in it. Group shells by the syntax they accept rather than by name: POSIX
 * shells take heredocs and `$(…)`, fish takes neither heredocs nor pre-3.4
 * `$(…)`, and nu takes neither plus rejects a quoted command name.
 *
 * `unknown` is the safety valve — an unrecognized shell keeps the POSIX form
 * it gets today instead of receiving a guess.
 */
export type ShellFamily = "posix" | "fish" | "nu" | "unknown";

const SHELL_FAMILIES: Record<string, ShellFamily> = {
	bash: "posix",
	dash: "posix",
	ksh: "posix",
	sh: "posix",
	zsh: "posix",
	fish: "fish",
	nu: "nu",
	nushell: "nu",
};

/**
 * Classify a resolved shell path (`/opt/homebrew/bin/nu`) into a syntax family.
 *
 * Splits on both separators instead of importing `node:path`: this module is
 * bundled into the renderer, which has no node builtins.
 */
export function getShellFamily(shellPath: string): ShellFamily {
	const basename = shellPath.trim().split(/[/\\]/).pop() ?? "";
	const name = basename.toLowerCase().replace(/\.exe$/, "");
	return SHELL_FAMILIES[name] ?? "unknown";
}

/**
 * Sanitize a prompt destined for a PTY. Launch commands are written to the
 * shell as if typed, so prompt bytes hit the line editor as keystrokes:
 * ESC/C1 sequences fire keybindings, a lone CR submits the line early, and a
 * tab triggers completion. Normalizes CRLF/CR to LF, removes ANSI CSI/OSC
 * sequences whole (so their printable payload doesn't survive as garbage),
 * strips remaining control characters, and expands tabs to four spaces.
 * Keeps newlines.
 */
export function sanitizePromptForPty(prompt: string): string {
	return (
		prompt
			.replace(/\r\n?/g, "\n")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars intentionally
			.replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, "")
			// Terminator is required: an unterminated OSC must not swallow the
			// rest of the line — its lead byte falls through to the strip below.
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars intentionally
			.replace(/(?:\x1b\]|\x9d)[^\x07\x1b\x9c\n]*(?:\x07|\x1b\\|\x9c)/g, "")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars intentionally
			.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "")
			.replaceAll("\t", "    ")
	);
}

function resolveDelimiter(prompt: string, randomId: string): string {
	let delimiter = `SUPERSET_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}
	return delimiter;
}

export function quoteSingleShell(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildArgvCommand(argv: string[]): string {
	return argv.map(quoteSingleShell).join(" ");
}

/**
 * Quote a value as a fish string literal.
 *
 * fish is not POSIX here: it honors `\\` and `\'` *inside* single quotes,
 * where bash honors nothing. Reusing `quoteSingleShell` therefore corrupts
 * silently, collapsing every `\\` in a prompt to a single backslash before the
 * agent ever sees it.
 */
export function quoteFishString(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

/** Build a fish command line from an argv array. */
export function buildFishArgvCommand(argv: string[]): string {
	return argv.map(quoteFishString).join(" ");
}

/**
 * Quote a value as a nu string literal.
 *
 * nu's single quotes are fully literal, so a value containing `'` has no
 * single-quoted representation at all; double quotes are the only form that
 * can round-trip arbitrary text. Inside them nu honors backslash escapes, so
 * escaping backslashes first keeps a literal `\n` in a prompt from decoding
 * into a newline.
 */
export function quoteNuString(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * Build a nu command line from an argv array.
 *
 * The command name is prefixed with `^` and quoted separately: nu parses a
 * bare quoted string in command position as a string literal, not a command
 * (`'claude' 'prompt'` fails with `nu::parser::parse_mismatch`), and `^`
 * forces the external binary even when a nu builtin shares its name.
 */
export function buildNuArgvCommand(argv: string[]): string {
	const [command, ...rest] = argv;
	if (command === undefined) return "";
	return [`^${quoteNuString(command)}`, ...rest.map(quoteNuString)].join(" ");
}

export function envOverlayPrefix(env: Record<string, string>): string {
	const assignments = Object.entries(env).map(
		([key, value]) => `${key}=${quoteSingleShell(value)}`,
	);
	return assignments.length > 0 ? `${assignments.join(" ")} ` : "";
}

/**
 * Prefix a command with an environment overlay, using syntax the target shell
 * accepts.
 *
 * fish and nu both honor `KEY=value command`, but not the values POSIX quoting
 * produces: nu fails to parse bash's `'\''` idiom outright, and fish collapses
 * `\\` inside single quotes. nu is also the one shell where assignment position
 * takes string literals *raw* (no escape decoding), which leaves no quoting
 * that survives both `'` and `"` in one value, so nu goes through `with-env`
 * instead, where values parse as ordinary nu strings.
 */
export function applyEnvOverlay({
	env,
	command,
	shellFamily,
}: {
	env: Record<string, string>;
	command: string;
	shellFamily: ShellFamily;
}): string {
	const entries = Object.entries(env);
	if (entries.length === 0) return command;

	if (shellFamily === "nu") {
		const record = entries
			.map(([key, value]) => `${quoteNuString(key)}: ${quoteNuString(value)}`)
			.join(", ");
		return `with-env {${record}} { ${command} }`;
	}

	const quote = shellFamily === "fish" ? quoteFishString : quoteSingleShell;
	const assignments = entries.map(([key, value]) => `${key}=${quote(value)}`);
	return `${assignments.join(" ")} ${command}`;
}

function joinCommand(command: string, suffix?: string): string {
	return suffix ? `${command} ${suffix}` : command;
}

export function buildPromptCommandString({
	command,
	suffix,
	transport,
	prompt: rawPrompt,
	randomId,
}: {
	command: string;
	suffix?: string;
	transport: PromptTransport;
	prompt: string;
	randomId: string;
}): string {
	const prompt = sanitizePromptForPty(rawPrompt);
	const delimiter = resolveDelimiter(prompt, randomId);
	const fullCommand = joinCommand(command, suffix);

	if (transport === "stdin") {
		return `${fullCommand} <<'${delimiter}'\n${prompt}\n${delimiter}`;
	}

	return `${command} "$(cat <<'${delimiter}'\n${prompt}\n${delimiter}\n)"${suffix ? ` ${suffix}` : ""}`;
}

export function buildPromptFileCommandString({
	command,
	suffix,
	transport,
	filePath,
}: {
	command: string;
	suffix?: string;
	transport: PromptTransport;
	filePath: string;
}): string {
	const quotedPath = quoteSingleShell(filePath);
	const fullCommand = joinCommand(command, suffix);

	if (transport === "stdin") {
		return `${fullCommand} < ${quotedPath}`;
	}

	return `${command} "$(cat ${quotedPath})"${suffix ? ` ${suffix}` : ""}`;
}
