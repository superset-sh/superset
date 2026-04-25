const MAX_TERMINAL_TITLE_LENGTH = 120;

export function parseConEmuOsc9Title(data: string): string | null | undefined {
	if (!data.startsWith("3;")) return undefined;
	return data.length === 2 ? null : data.slice(2);
}

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
	return Array.from(normalized).slice(0, MAX_TERMINAL_TITLE_LENGTH).join("");
}
