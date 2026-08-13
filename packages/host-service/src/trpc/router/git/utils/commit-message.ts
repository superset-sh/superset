/** Full commit message, split the way git itself presents it. */
export interface CommitMessage {
	/** First paragraph, folded to one line — matches `git log --format=%s`. */
	subject: string;
	/** Everything after the first blank line, verbatim. Empty when absent. */
	body: string;
}

/**
 * `git log --format=%s` collapses a multi-line first paragraph into a single
 * line, so folding here keeps a popover header identical to the list row that
 * opened it. Everything after the first blank line is the body and is left
 * untouched — blank lines and indentation are meaningful in trailers and
 * bullet lists.
 */
export function splitCommitMessage(raw: string): CommitMessage {
	const normalized = raw.replace(/\r\n/g, "\n").replace(/^\n+/, "");
	const separator = normalized.indexOf("\n\n");

	if (separator === -1) {
		return { subject: foldSubject(normalized), body: "" };
	}

	return {
		subject: foldSubject(normalized.slice(0, separator)),
		body: normalized.slice(separator + 2).replace(/\s+$/, ""),
	};
}

function foldSubject(paragraph: string): string {
	return paragraph.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * Restricts a ref to a hex object name before it reaches `git log`. Without
 * this a caller could pass a flag (`--output=…`) or a revision expression
 * (`HEAD~1`, a branch name) and read something other than the commit the UI
 * is showing.
 */
export function isValidCommitHash(hash: string): boolean {
	return /^[0-9a-fA-F]{7,64}$/.test(hash);
}
