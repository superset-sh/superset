export function getErrorMessage(error: unknown): string | null {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (error) return "Unexpected chat error";
	return null;
}

// Host-service throws this when the chat runtime can't find Anthropic/OpenAI
// credentials (packages/host-service/src/runtime/chat/chat.ts).
export function isMissingModelProviderError(
	errorMessage: string | null,
): boolean {
	if (!errorMessage) return false;
	return /no model provider credentials/i.test(errorMessage);
}
