const MAX_TITLE_LENGTH = 32;

export function sanitizeForTitle(text: string): string | null {
	const cleaned = text
		.slice(0, MAX_TITLE_LENGTH * 2)
		.replace(/[^a-z0-9 _\-./]/g, "")
		.trim()
		.slice(0, MAX_TITLE_LENGTH);

	return cleaned || null;
}
