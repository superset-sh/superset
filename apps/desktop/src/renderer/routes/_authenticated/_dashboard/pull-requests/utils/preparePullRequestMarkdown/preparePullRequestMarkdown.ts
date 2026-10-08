export type PullRequestAlertKind =
	| "note"
	| "tip"
	| "important"
	| "warning"
	| "caution";

export type PullRequestAlertLabels = Record<PullRequestAlertKind, string>;

const CODE_SPLIT_PATTERN = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/;
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const ALERT_MARKER_PATTERN =
	/^([ \t]*>[ \t]*)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/gim;

const DEFAULT_ALERT_LABELS: PullRequestAlertLabels = {
	note: "Note",
	tip: "Tip",
	important: "Important",
	warning: "Warning",
	caution: "Caution",
};

/**
 * Drops the template comments GitHub bodies carry ("READ BEFORE OPENING") so
 * a comment-only body reads as empty, and turns GitHub's alert markers
 * (`> [!NOTE]`) into a bold label the renderer can show. Code spans and
 * fences stay as written.
 */
export function preparePullRequestMarkdown(
	markdown: string,
	alertLabels: PullRequestAlertLabels = DEFAULT_ALERT_LABELS,
): string {
	return markdown
		.split(CODE_SPLIT_PATTERN)
		.map((segment, index) =>
			index % 2 === 1
				? segment
				: segment
						.replace(HTML_COMMENT_PATTERN, "")
						.replace(
							ALERT_MARKER_PATTERN,
							(_match, prefix: string, kind: string) =>
								`${prefix}**${alertLabels[kind.toLowerCase() as PullRequestAlertKind]}**`,
						),
		)
		.join("")
		.trim();
}
