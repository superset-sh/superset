export interface FrontMatterSplit {
	/** Verbatim front-matter block including its closing delimiter line. */
	frontMatter: string;
	body: string;
}

/**
 * Splits a leading YAML front-matter block off a markdown document. TipTap
 * has no front-matter node — it renders the block as a mangled heading and
 * destroys it on serialize — so the preview hides it and re-attaches the
 * verbatim text on save.
 *
 * Deliberately conservative: the block must start at the first byte with a
 * bare `---` line and close with a `---`/`...` line before any blank line,
 * so hr-delimited documents ("---\n\ncontent\n\n---") never match.
 */
export function splitFrontMatter(text: string): FrontMatterSplit {
	const noMatch: FrontMatterSplit = { frontMatter: "", body: text };
	const firstLineEnd = text.indexOf("\n");
	if (firstLineEnd === -1 || text.slice(0, firstLineEnd).trimEnd() !== "---") {
		return noMatch;
	}

	let pos = firstLineEnd + 1;
	while (pos < text.length) {
		const lineEnd = text.indexOf("\n", pos);
		const line = lineEnd === -1 ? text.slice(pos) : text.slice(pos, lineEnd);
		const trimmed = line.trimEnd();
		if (trimmed === "---" || trimmed === "...") {
			const end = lineEnd === -1 ? text.length : lineEnd + 1;
			return { frontMatter: text.slice(0, end), body: text.slice(end) };
		}
		if (trimmed === "") {
			return noMatch;
		}
		if (lineEnd === -1) {
			return noMatch;
		}
		pos = lineEnd + 1;
	}
	return noMatch;
}
