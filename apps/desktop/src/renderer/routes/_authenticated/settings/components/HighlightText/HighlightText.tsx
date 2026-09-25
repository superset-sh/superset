import { Fragment, type ReactNode } from "react";
import { splitSearchTerms } from "../../utils/settings-search";

interface HighlightTextProps {
	text: string;
	query: string;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function HighlightText({ text, query }: HighlightTextProps): ReactNode {
	const terms = splitSearchTerms(query);
	if (terms.length === 0) return text;

	// Longest term first: when one term is a prefix of another (e.g. "bran"
	// and "branch"), matching the longer one first avoids the shorter term
	// "stealing" the match and leaving the rest of the word unhighlighted.
	const sortedTerms = [...terms].sort((a, b) => b.length - a.length);
	const pattern = new RegExp(
		`(${sortedTerms.map(escapeRegExp).join("|")})`,
		"gi",
	);
	const parts = text.split(pattern);
	if (parts.length === 1) return text;

	return (
		// A single wrapper element so this always counts as one flex/grid item
		// in the caller's layout, regardless of how many parts it contains —
		// a bare Fragment here would let a `gap-*` container space the
		// highlighted and unhighlighted segments apart from each other.
		<span>
			{parts.map((part, i) =>
				// split() with a single capturing group alternates unmatched text
				// (even indices) and matched terms (odd indices).
				i % 2 === 1 ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split of static text
					<mark key={i} className="rounded-sm bg-highlight-match text-inherit">
						{part}
					</mark>
				) : part ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: parts come from a stable split of static text
					<Fragment key={i}>{part}</Fragment>
				) : null,
			)}
		</span>
	);
}
