const EXCERPT_MAX_LINES = 4;
const EXCERPT_MAX_CHARS = 320;

function quoteLines(lines: readonly string[]): string {
	return lines.map((line) => (line ? `> ${line}` : ">")).join("\n");
}

/** Lines without the blank ones at either end, and with runs of blank lines folded to one. */
function meaningfulLines(text: string): string[] {
	const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
	const folded = lines.filter(
		(line, index) => line !== "" || (index > 0 && lines[index - 1] !== ""),
	);
	while (folded[0] === "") folded.shift();
	while (folded[folded.length - 1] === "") folded.pop();
	return folded;
}

function excerptLines(text: string): string[] {
	const lines = meaningfulLines(text)
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter((line) => line !== "");
	const kept: string[] = [];
	let budget = EXCERPT_MAX_CHARS;
	let cut = false;
	for (const line of lines) {
		if (kept.length === EXCERPT_MAX_LINES || budget <= 0) {
			cut = true;
			break;
		}
		if (line.length > budget) {
			kept.push(line.slice(0, budget).trimEnd());
			cut = true;
			break;
		}
		kept.push(line);
		budget -= line.length;
	}
	const last = kept.length - 1;
	if (cut && last >= 0) kept[last] = `${kept[last]}…`;
	return kept;
}

/**
 * The quote that opens a reply to a conversation comment, as GitHub's "Quote
 * reply" builds it: the reader's selection when there is one, otherwise the
 * comment's opening lines, cut short so a bot's long report does not flood
 * the composer. GitHub has no threads on conversation comments; the quote is
 * what ties the reply to what it answers.
 */
export function quotePullRequestComment({
	selection,
	text,
}: {
	selection: string;
	text: string;
}): string {
	const selected = meaningfulLines(selection);
	return quoteLines(selected.length > 0 ? selected : excerptLines(text));
}

/** The draft with the quote after whatever is already written, and a blank line to type the reply on. */
export function appendQuoteToDraft(draft: string, quote: string): string {
	if (!quote) return draft;
	const written = draft.trimEnd();
	return `${written ? `${written}\n\n` : ""}${quote}\n\n`;
}
