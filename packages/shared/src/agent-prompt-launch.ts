/**
 * Prompt transports define the small set of ways a CLI can receive prompt
 * payloads. Keep this enum intentionally small and add a new transport only
 * when a real agent requires it. Avoid arbitrary per-agent shell templates.
 */
export const PROMPT_TRANSPORTS = ["argv", "stdin"] as const;

export type PromptTransport = (typeof PROMPT_TRANSPORTS)[number];

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

export function envOverlayPrefix(env: Record<string, string>): string {
	const assignments = Object.entries(env).map(
		([key, value]) => `${key}=${quoteSingleShell(value)}`,
	);
	return assignments.length > 0 ? `${assignments.join(" ")} ` : "";
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
