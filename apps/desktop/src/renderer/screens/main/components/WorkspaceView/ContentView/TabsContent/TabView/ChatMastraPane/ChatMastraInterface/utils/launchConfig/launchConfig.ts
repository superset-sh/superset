import type { ChatMastraLaunchConfig } from "shared/tabs-types";

/**
 * Returns the text to pre-fill in the chat input when a launch config is provided.
 *
 * When `autoSend` is true, the prompt is sent automatically to the agent instead
 * of being pre-filled — so this returns an empty string in that case.
 */
export function getPrefillInput(
	launchConfig: ChatMastraLaunchConfig | null | undefined,
): string {
	const prompt = launchConfig?.initialPrompt?.trim();
	if (!prompt) return "";
	if (launchConfig?.autoSend === true) return "";
	return prompt;
}

/**
 * Returns whether the launch config should auto-send its initial prompt to the agent.
 * Only true when `autoSend` is explicitly set to `true` and a non-empty prompt exists.
 */
export function shouldAutoSend(
	launchConfig: ChatMastraLaunchConfig | null | undefined,
): boolean {
	return (
		launchConfig?.autoSend === true && !!launchConfig.initialPrompt?.trim()
	);
}
