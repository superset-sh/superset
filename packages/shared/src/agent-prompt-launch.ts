/**
 * Prompt transports define the small set of ways a CLI can receive prompt
 * payloads. Keep this enum intentionally small and add a new transport only
 * when a real agent requires it. Avoid arbitrary per-agent shell templates.
 */
export const PROMPT_TRANSPORTS = ["argv", "stdin"] as const;

export type PromptTransport = (typeof PROMPT_TRANSPORTS)[number];

function quoteSingleShell(value: string): string {
	return value.replaceAll("'", "'\\''");
}

function joinCommand(command: string, suffix?: string): string {
	return suffix ? `${command} ${suffix}` : command;
}

/**
 * Maximum number of raw prompt bytes per emitted shell argument. Each argument
 * becomes one (or, if it contains a newline, a few) physical line(s) of the
 * launch command. macOS terminals buffer canonical-mode input line by line with
 * a hard 1024-byte limit (`TTYHOG`/`MAX_INPUT`); a line at or above that size is
 * mangled before the shell reads it and hangs the launch (issue #5092). Single
 * quotes expand to four bytes when escaped (`'` -> `'\''`), so a 200-byte raw
 * chunk stays under ~810 bytes even in the pathological all-quotes case — safely
 * below the limit with room for the surrounding quoting.
 */
const MAX_PROMPT_CHUNK_BYTES = 200;

const utf8Encoder = new TextEncoder();

/**
 * Split a prompt into chunks no larger than `MAX_PROMPT_CHUNK_BYTES`, iterating
 * by Unicode code point so multi-byte characters are never split across chunks.
 * Always yields at least one chunk (the empty string for an empty prompt).
 */
function chunkPromptByBytes(prompt: string): string[] {
	const chunks: string[] = [];
	let current = "";
	let currentBytes = 0;

	for (const codePoint of prompt) {
		const codePointBytes = utf8Encoder.encode(codePoint).length;
		if (current && currentBytes + codePointBytes > MAX_PROMPT_CHUNK_BYTES) {
			chunks.push(current);
			current = "";
			currentBytes = 0;
		}
		current += codePoint;
		currentBytes += codePointBytes;
	}

	chunks.push(current);
	return chunks;
}

/**
 * Reassemble the prompt at runtime via `printf '%s'` with each chunk passed as a
 * separate single-quoted argument on its own line. `printf '%s'` reuses the
 * format for every argument, concatenating them byte-for-byte, so the prompt is
 * reconstructed verbatim regardless of shell metacharacters. Splitting across
 * many short lines keeps each line well under the macOS canonical-mode limit.
 */
function buildPromptReconstructor(prompt: string): string {
	const args = chunkPromptByBytes(prompt).map(
		(chunk) => `'${quoteSingleShell(chunk)}'`,
	);
	return `printf '%s' ${args.join(" \\\n")}`;
}

export function buildPromptCommandString({
	command,
	suffix,
	transport,
	prompt,
}: {
	command: string;
	suffix?: string;
	transport: PromptTransport;
	prompt: string;
	/** Retained for API compatibility; no longer used to build a heredoc delimiter. */
	randomId: string;
}): string {
	const reconstructor = buildPromptReconstructor(prompt);
	const fullCommand = joinCommand(command, suffix);

	if (transport === "stdin") {
		return `${reconstructor} | ${fullCommand}`;
	}

	return `${command} "$(${reconstructor})"${suffix ? ` ${suffix}` : ""}`;
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
