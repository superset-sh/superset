/**
 * Prompt transports define the small set of ways a CLI can receive prompt
 * payloads. Keep this enum intentionally small and add a new transport only
 * when a real agent requires it. Avoid arbitrary per-agent shell templates.
 */
export type PromptTransport = "argv" | "stdin";

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
