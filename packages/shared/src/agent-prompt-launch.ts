/**
 * Prompt transports define the small set of ways a CLI can receive prompt
 * payloads. Keep this enum intentionally small and add a new transport only
 * when a real agent requires it. Avoid arbitrary per-agent shell templates.
 */
export const PROMPT_TRANSPORTS = ["argv", "stdin"] as const;

export type PromptTransport = (typeof PROMPT_TRANSPORTS)[number];

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

// The generated command lands in the user's terminal pane, which runs
// $SHELL (often fish or zsh). Heredocs and `$(...)` are bash-specific —
// fish parses `<<` as input redirection and errors out before the agent
// can start (see #4705). Wrapping in `bash -c '...'` lets the user's
// shell see a single, well-formed POSIX invocation regardless of which
// shell they configured. The `'\''` escape works in fish too: it closes
// the single-quoted string, emits a literal quote, then reopens.
function wrapForPosixShell(command: string): string {
	return `bash -c '${quoteSingleShell(command)}'`;
}

export function buildPromptCommandString({
	command,
	suffix,
	transport,
	prompt,
	randomId,
}: {
	command: string;
	suffix?: string;
	transport: PromptTransport;
	prompt: string;
	randomId: string;
}): string {
	const delimiter = resolveDelimiter(prompt, randomId);
	const fullCommand = joinCommand(command, suffix);

	if (transport === "stdin") {
		return wrapForPosixShell(
			`${fullCommand} <<'${delimiter}'\n${prompt}\n${delimiter}`,
		);
	}

	return wrapForPosixShell(
		`${command} "$(cat <<'${delimiter}'\n${prompt}\n${delimiter}\n)"${suffix ? ` ${suffix}` : ""}`,
	);
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
		// Plain `<` redirection is POSIX — works in bash, zsh, AND fish — so
		// we leave this case unwrapped to keep the user-visible command tidy.
		return `${fullCommand} < '${escapedPath}'`;
	}

	return wrapForPosixShell(
		`${command} "$(cat '${escapedPath}')"${suffix ? ` ${suffix}` : ""}`,
	);
}
