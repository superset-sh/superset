// Review bots (coderabbit, greptile, cubic) open with a badge strip —
// "_🩺 Stability & Availability_ | _🟠 Major_ | _⚡ Quick win_" — and bury the
// reasoning in a <details> block. Neither says what the comment wants.
const BADGE_STRIP = /^\s*(?:_[^_]*_\s*\|\s*)+_[^_]*_\s*$/;
/** A horizontal rule reads as "--- ---" once flattened into one line. */
const RULE = /^\s*([-*_])\s*(?:\1\s*){2,}$/;
const BADGE_WORDS =
	/^(potential issue|nitpick|major|minor|critical|quick win|suggestion|refactor suggestion|verification agent)\b/i;

/**
 * Plain-text preview of a markdown comment body: enough to recognise the
 * comment in a collapsed card, with bot badge strips, `<details>` reasoning,
 * fenced code and images dropped.
 */
export function previewText(body: string): string {
	// Whole-body passes first: a <details> block and a fence both span lines,
	// and their innards ("Analysis chain", "Web query: …") crowd out the finding.
	const prose = body
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<details>[\s\S]*?(?:<\/details>|$)/g, " ")
		.replace(/```[\s\S]*?(?:```|$)/g, " ");
	const kept: string[] = [];
	for (const line of prose.split(/\r?\n/)) {
		if (BADGE_STRIP.test(line) || RULE.test(line)) continue;
		const text = line
			.replace(/<[^>]+>/g, " ")
			.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/[*_`>#]/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (!text) continue;
		if (BADGE_WORDS.test(text.replace(/^[^\p{L}\p{N}]+/u, ""))) continue;
		kept.push(text);
		if (kept.length === 3) break;
	}
	return kept.join(" ") || "No preview available";
}
