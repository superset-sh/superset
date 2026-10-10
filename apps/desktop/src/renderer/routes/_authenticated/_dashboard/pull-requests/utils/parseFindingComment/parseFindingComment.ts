export type PullRequestCommentSeverity = "High" | "Medium" | "Low";

export interface ParsedFindingComment {
	title: string;
	severity: PullRequestCommentSeverity;
	/** Remaining body markdown, with the title heading and severity line removed. */
	body: string;
}

const HEADING_LINE_RE = /^#{1,3}\s+(.+?)\s*$/;
const SEVERITY_LINE_RE = /^(high|medium|low)\s+severity$/i;

function normalizeSeverityLine(raw: string): string {
	const withoutHeading = raw.trim().replace(/^#{1,4}\s+/, "");
	const emphasis = /^(\*\*|__)(.+)\1$/.exec(withoutHeading);
	return (emphasis?.[2] ?? withoutHeading).trim();
}

function nextNonBlankIndex(lines: readonly string[], from: number): number {
	let index = from;
	while (index < lines.length && lines[index]?.trim() === "") index += 1;
	return index;
}

/**
 * Review bots post findings as a leading H1–H3 title followed by a bare
 * "High|Medium|Low Severity" line. Those render as a title and a severity
 * subheading; anything else stays plain markdown.
 */
export function parseFindingComment(body: string): ParsedFindingComment | null {
	const lines = body.split(/\r?\n/);
	const titleIndex = nextNonBlankIndex(lines, 0);
	const title = lines[titleIndex]?.match(HEADING_LINE_RE)?.[1]?.trim();
	if (!title) return null;
	const severityIndex = nextNonBlankIndex(lines, titleIndex + 1);
	const severityWord = normalizeSeverityLine(lines[severityIndex] ?? "").match(
		SEVERITY_LINE_RE,
	)?.[1];
	if (!severityWord) return null;
	const lower = severityWord.toLowerCase();
	return {
		title,
		severity: (lower.charAt(0).toUpperCase() +
			lower.slice(1)) as PullRequestCommentSeverity,
		body: lines
			.slice(nextNonBlankIndex(lines, severityIndex + 1))
			.join("\n")
			.trim(),
	};
}
