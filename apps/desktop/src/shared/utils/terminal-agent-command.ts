export function derivePromptCommandFromCommand({
	command,
	baseCommand,
	basePromptCommand,
}: {
	command: string;
	baseCommand: string;
	basePromptCommand: string;
}): string | null {
	const trimmedCommand = command.trim();
	const trimmedBaseCommand = baseCommand.trim();
	const trimmedBasePromptCommand = basePromptCommand.trim();

	if (!trimmedCommand || !trimmedBaseCommand || !trimmedBasePromptCommand) {
		return null;
	}

	if (trimmedBasePromptCommand === trimmedBaseCommand) {
		return trimmedCommand;
	}

	if (trimmedBasePromptCommand.startsWith(`${trimmedBaseCommand} `)) {
		const trailingPromptSegment = trimmedBasePromptCommand.slice(
			trimmedBaseCommand.length,
		);
		return `${trimmedCommand}${trailingPromptSegment}`;
	}

	return null;
}
