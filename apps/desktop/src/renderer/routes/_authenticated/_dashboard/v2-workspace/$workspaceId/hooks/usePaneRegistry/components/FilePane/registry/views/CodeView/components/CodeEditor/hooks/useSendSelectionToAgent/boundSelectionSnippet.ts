/** Primary cap: a selection wider than this many lines is truncated. */
export const SELECTION_MAX_LINES = 400;
/** Backstop cap for very long single lines that stay under the line cap. */
export const SELECTION_MAX_CHARS = 20_000;

const TRUNCATION_MARKER = "\n… [selection truncated]";

/** Bound a snippet to the prompt budget, keeping the head and appending an
 *  elision marker when truncated. The full L<a>-L<b> anchor still reflects the
 *  complete range, so the agent can re-read the rest from disk. */
export function boundSelectionSnippet(raw: string): string {
	let truncated = false;
	let text = raw;

	const lines = text.split("\n");
	if (lines.length > SELECTION_MAX_LINES) {
		text = lines.slice(0, SELECTION_MAX_LINES).join("\n");
		truncated = true;
	}

	if (text.length > SELECTION_MAX_CHARS) {
		text = text.slice(0, SELECTION_MAX_CHARS);
		truncated = true;
	}

	return truncated ? `${text}${TRUNCATION_MARKER}` : text;
}
