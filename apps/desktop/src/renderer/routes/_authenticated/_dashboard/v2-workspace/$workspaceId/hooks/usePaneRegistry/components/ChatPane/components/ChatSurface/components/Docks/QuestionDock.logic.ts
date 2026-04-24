/**
 * Key-to-option mapping for QuestionDock — pressing 1–9 selects the
 * corresponding option (t3code pattern).
 */

export function optionIndexForKey(key: string): number | null {
	if (key.length !== 1) return null;
	const code = key.charCodeAt(0);
	if (code < 49 || code > 57) return null; // not 1..9
	return code - 49; // "1" -> 0
}
