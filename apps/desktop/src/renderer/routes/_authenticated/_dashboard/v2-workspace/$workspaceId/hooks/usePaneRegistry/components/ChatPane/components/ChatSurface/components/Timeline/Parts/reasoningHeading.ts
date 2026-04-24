/**
 * Pure helper: extract a short human-readable heading from a reasoning
 * block's raw text. Reasoning content can be multi-paragraph internal
 * monologue — for collapsed state, we want a one-line preview.
 *
 * Heuristic (port of OpenCode's `heading()` util used in session-turn):
 *   1. First markdown heading ("# foo", "## bar", "### baz") → its text
 *   2. First line of bold text ("**foo:** …") → "foo"
 *   3. First non-empty line, trimmed + truncated
 */

const MAX_HEADING_LENGTH = 80;

export function extractReasoningHeading(text: string): string {
	if (!text) return "";
	const lines = text.split(/\r?\n/);

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		// Markdown heading
		const mdHeading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
		if (mdHeading?.[1]) return truncate(mdHeading[1]);

		// Bold-prefixed line: "**Foo:** …" or "**Foo**"
		const bold = /^\*\*([^*]+?)\*\*[:.\s]/.exec(line);
		if (bold?.[1]) return truncate(stripTrailingPunct(bold[1]));
		const boldAlone = /^\*\*([^*]+?)\*\*\s*$/.exec(line);
		if (boldAlone?.[1]) return truncate(stripTrailingPunct(boldAlone[1]));

		// Fallback: just the line
		return truncate(line);
	}
	return "";
}

function truncate(s: string): string {
	const cleaned = s.trim().replace(/\s+/g, " ");
	if (cleaned.length <= MAX_HEADING_LENGTH) return cleaned;
	return `${cleaned.slice(0, MAX_HEADING_LENGTH - 1)}…`;
}

function stripTrailingPunct(s: string): string {
	return s.replace(/[:;.,\s]+$/, "");
}
