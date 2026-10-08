import { parseDiffFromFile } from "@pierre/diffs";
import type { ToolContent } from "@superset/chat/protocol";

export type DiffStats = { additions: number; deletions: number };

type DiffToolContent = Extract<ToolContent, { type: "diff" }>;

/** Past this many characters the count is not worth the diff it costs. */
const MAX_STATS_CHARS = 400_000;

export function diffStats(content: DiffToolContent): DiffStats | null {
	const size = content.newText.length + (content.oldText?.length ?? 0);
	if (size > MAX_STATS_CHARS) return null;
	try {
		const parsed = parseDiffFromFile(
			content.oldText === null
				? null
				: { name: content.path, contents: content.oldText },
			{ name: content.path, contents: content.newText },
		);
		let additions = 0;
		let deletions = 0;
		for (const hunk of parsed.hunks) {
			additions += hunk.additionLines;
			deletions += hunk.deletionLines;
		}
		return { additions, deletions };
	} catch (error) {
		console.warn("[chat] diff stats failed", content.path, error);
		return null;
	}
}
