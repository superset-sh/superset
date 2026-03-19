interface PromptResolutionInput {
	handled: boolean;
	prompt?: string;
	commandName?: string;
	invokedAs?: string;
}

interface PromptResolution {
	handled: boolean;
	nextText: string;
	errorMessage?: string;
}

function getSlashCommandLabel(input: PromptResolutionInput): string {
	const rawLabel = input.invokedAs?.trim() || input.commandName?.trim() || "";
	const normalized = rawLabel.replace(/^\//, "");
	return normalized || "command";
}

export function resolveSlashPromptResult(
	input: PromptResolutionInput,
): PromptResolution {
	if (!input.handled) {
		return { handled: false, nextText: "" };
	}

	const nextText = (input.prompt ?? "").trim();
	if (nextText.length > 0) {
		return { handled: false, nextText };
	}

	return {
		handled: true,
		nextText: "",
		errorMessage: `Slash command /${getSlashCommandLabel(input)} produced an empty prompt`,
	};
}
