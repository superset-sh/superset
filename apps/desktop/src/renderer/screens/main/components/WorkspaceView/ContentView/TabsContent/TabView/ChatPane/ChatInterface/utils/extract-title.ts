const MAX_TITLE_LENGTH = 80;

export function extractTitleFromMessages(
	messages: Array<{
		role: string;
		parts?: Array<{ type: string; content?: string }>;
	}>,
): string | null {
	const firstUser = messages.find((m) => m.role === "user");
	if (!firstUser?.parts) return null;

	const textPart = firstUser.parts.find((p) => p.type === "text");
	const content = textPart?.content;
	if (!content) return null;

	return content.length > MAX_TITLE_LENGTH
		? `${content.slice(0, MAX_TITLE_LENGTH)}...`
		: content;
}
