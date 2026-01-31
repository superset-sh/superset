import stripAnsi from "strip-ansi";

const MAX_TITLE_LENGTH = 32;

export function sanitizeForTitle(text: string): string | null {
	const cleaned = stripAnsi(text).trim().slice(0, MAX_TITLE_LENGTH);

	return cleaned || null;
}
