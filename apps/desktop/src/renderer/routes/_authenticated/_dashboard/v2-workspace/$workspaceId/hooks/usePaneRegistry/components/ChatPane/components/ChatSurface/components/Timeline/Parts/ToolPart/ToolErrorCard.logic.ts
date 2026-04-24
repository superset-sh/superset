/**
 * Pure helpers for ToolErrorCard. Error messages from providers often
 * come in as "Error: actual message" — we strip the prefix and pull the
 * first meaningful line for the collapsed subtitle.
 */

export function cleanErrorText(raw: string): string {
	return raw.replace(/^Error:\s*/i, "").trim();
}

export function firstLineOfError(cleaned: string): string {
	const first = cleaned.split(/\r?\n/).find((line) => line.trim().length > 0);
	if (!first) return cleaned;
	// If the first line is "thing: details" prefer the details after the colon.
	const idx = first.indexOf(": ");
	if (idx > 0 && idx < first.length - 2) return first.slice(idx + 2).trim();
	return first.trim();
}
