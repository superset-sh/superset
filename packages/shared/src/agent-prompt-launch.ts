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

/**
 * Parsed shape of a heredoc prompt command produced by
 * buildPromptCommandString. Both heredoc forms are bash/zsh-only — fish has
 * no heredocs, so typing one into a fish session dies at parse ("Expected a
 * string, but found a redirection", #4705). The host rewrites such commands
 * at launch time when the shell is fish; the parser lives next to the builder
 * so the two can't drift apart.
 */
export interface ParsedPromptHeredocCommand {
	transport: PromptTransport;
	/** For argv: the program + args before the payload. For stdin: the full command. */
	command: string;
	/** Exact prompt bytes carried by the heredoc body. */
	prompt: string;
	/** argv-transport trailing suffix (without its leading space), or undefined. */
	suffix?: string;
}

// The delimiter is SUPERSET_PROMPT_<hex uuid> plus optional _X de-collision
// runs — never present in the prompt body (resolveDelimiter guarantees it),
// so the backreference match is unambiguous.
const ARGV_HEREDOC_PATTERN =
	/^([\s\S]+?) "\$\(cat <<'(SUPERSET_PROMPT_[A-Za-z0-9_]+)'\n([\s\S]*)\n\2\n\)"([^\n]*)$/;
const STDIN_HEREDOC_PATTERN =
	/^([\s\S]+?) <<'(SUPERSET_PROMPT_[A-Za-z0-9_]+)'\n([\s\S]*)\n\2$/;

export function parsePromptHeredocCommand(
	commandText: string,
): ParsedPromptHeredocCommand | null {
	const argv = ARGV_HEREDOC_PATTERN.exec(commandText);
	if (argv) {
		const [, command, , prompt, rawSuffix] = argv;
		if (command === undefined || prompt === undefined) return null;
		const suffix = rawSuffix?.replace(/^ /, "");
		return {
			transport: "argv",
			command,
			prompt,
			suffix: suffix || undefined,
		};
	}
	const stdin = STDIN_HEREDOC_PATTERN.exec(commandText);
	if (stdin) {
		const [, command, , prompt] = stdin;
		if (command === undefined || prompt === undefined) return null;
		return { transport: "stdin", command, prompt };
	}
	return null;
}

/**
 * fish equivalent of buildPromptCommandString for a prompt already staged to
 * disk. `(cat file | string collect)` is fish's documented way to read a file
 * into a single argument with internal newlines preserved; like bash's
 * `"$()"`, trailing newlines are trimmed, and --allow-empty keeps the arity
 * identical (one argument even when the file is empty). Each form deletes the
 * staged file the moment it has been read (argv) or opened (stdin — the
 * begin-block redirection opens the fd before the rm runs, plain unix
 * unlink semantics), so the prompt bytes never outlive the launch.
 * promptFilePath must not contain backslashes (fish single-quote escaping
 * differs from POSIX there); staged tmp-dir paths satisfy this.
 */
export function buildFishPromptCommandString({
	command,
	suffix,
	transport,
	promptFilePath,
}: {
	command: string;
	suffix?: string;
	transport: PromptTransport;
	promptFilePath: string;
}): string {
	const quotedPath = quoteSingleShell(promptFilePath);
	if (transport === "stdin") {
		return `begin; command rm -f -- ${quotedPath}; ${joinCommand(command, suffix)}; end < ${quotedPath}`;
	}
	return `${command} (begin; cat ${quotedPath}; command rm -f -- ${quotedPath}; end | string collect --allow-empty)${suffix ? ` ${suffix}` : ""}`;
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
