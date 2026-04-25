const MAX_TERMINAL_TITLE_LENGTH = 120;

export function normalizeTerminalTitle(
	title: string | null | undefined,
): string | null {
	if (title == null) return null;

	const withoutControlCharacters = Array.from(title, (character) => {
		const codePoint = character.codePointAt(0) ?? 0;
		return codePoint < 32 || codePoint === 127 ? " " : character;
	}).join("");
	const normalized = withoutControlCharacters.replace(/\s+/g, " ").trim();

	if (normalized.length === 0) return null;
	return normalized.slice(0, MAX_TERMINAL_TITLE_LENGTH);
}
