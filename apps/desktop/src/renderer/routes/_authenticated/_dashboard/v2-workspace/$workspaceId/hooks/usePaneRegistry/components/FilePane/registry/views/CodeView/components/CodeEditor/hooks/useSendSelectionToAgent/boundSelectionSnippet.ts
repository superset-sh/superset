/** Primary cap: a selection wider than this many lines is truncated. */
export const SELECTION_MAX_LINES = 400;
/** Backstop cap for very long single lines that stay under the line cap. */
export const SELECTION_MAX_CHARS = 20_000;

const TRUNCATION_MARKER = "\n… [selection truncated]";

export interface BoundedSnippet {
	text: string;
	truncated: boolean;
}

/** Bound a selected snippet to the prompt budget before it is embedded.
 *  Truncation keeps the HEAD of the selection (where the user began the
 *  highlight, the likeliest intent anchor) and appends an explicit elision
 *  marker so the agent knows the snippet is partial — the full L<a>-L<b> anchor
 *  in the prompt always reflects the COMPLETE range, so the agent can re-read
 *  the rest from disk. */
export function boundSelectionSnippet(raw: string): BoundedSnippet {
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

	return truncated
		? { text: `${text}${TRUNCATION_MARKER}`, truncated: true }
		: { text, truncated: false };
}
