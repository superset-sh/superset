/**
 * Prompt transports define the small set of ways a CLI can receive prompt
 * payloads. Keep this enum intentionally small and add a new transport only
 * when a real agent requires it. Avoid arbitrary per-agent shell templates.
 */
export const PROMPT_TRANSPORTS = ["argv", "stdin"] as const;

export type PromptTransport = (typeof PROMPT_TRANSPORTS)[number];

/**
 * Strip control characters from a prompt destined for a PTY. Launch commands
 * are written to the shell as if typed, so ESC/C1 bytes in the prompt would be
 * interpreted by the line editor as keystrokes (mangling the command or firing
 * arbitrary keybindings) and a lone CR would submit the line early. Keeps
 * newlines and tabs; normalizes CRLF/CR to LF.
 */
export function sanitizePromptForPty(prompt: string): string {
	return (
		prompt
			.replace(/\r\n?/g, "\n")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars intentionally
			.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "")
	);
}

function resolveDelimiter(prompt: string, randomId: string): string {
	let delimiter = `SUPERSET_PROMPT_${randomId.replaceAll("-", "")}`;
	while (prompt.includes(delimiter)) {
		delimiter = `${delimiter}_X`;
	}
	return delimiter;
}

function quoteSingleShell(value: string): string {
	return value.replaceAll("'", "'\\''");
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
	const escapedPath = quoteSingleShell(filePath);
	const fullCommand = joinCommand(command, suffix);

	if (transport === "stdin") {
		return `${fullCommand} < '${escapedPath}'`;
	}

	return `${command} "$(cat '${escapedPath}')"${suffix ? ` ${suffix}` : ""}`;
}
