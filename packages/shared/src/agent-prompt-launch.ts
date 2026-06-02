/**
 * Prompt transports define the small set of ways a CLI can receive prompt
 * payloads. Keep this enum intentionally small and add a new transport only
 * when a real agent requires it. Avoid arbitrary per-agent shell templates.
 */
export const PROMPT_TRANSPORTS = ["argv", "stdin"] as const;

export type PromptTransport = (typeof PROMPT_TRANSPORTS)[number];

const XARGS_PROMPT_PLACEHOLDER = "__SUP_PROMPT__";

function quoteSingleShell(value: string): string {
	return value.replaceAll("'", "'\\''");
}

function quoteShellArg(value: string): string {
	return `'${quoteSingleShell(value)}'`;
}

function joinCommand(command: string, suffix?: string): string {
	return suffix ? `${command} ${suffix}` : command;
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
	randomId: string;
}): string {
	const fullCommand = joinCommand(command, suffix);
	const promptArg = quoteShellArg(prompt);

	if (transport === "stdin") {
		return `printf '%s\\n' ${promptArg} | ${fullCommand}`;
	}

	return `${command} ${promptArg}${suffix ? ` ${suffix}` : ""}`;
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
	const escapedPath = quoteShellArg(filePath);
	const fullCommand = joinCommand(command, suffix);

	if (transport === "stdin") {
		return `${fullCommand} < ${escapedPath}`;
	}

	return `xargs -0 -I ${XARGS_PROMPT_PLACEHOLDER} ${command} ${XARGS_PROMPT_PLACEHOLDER}${
		suffix ? ` ${suffix}` : ""
	} < ${escapedPath}`;
}
