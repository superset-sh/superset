/**
 * `+N −M` summary for a file's diff stats (minus sign is U+2212, matching the
 * tree row decorations and PR list rows). Empty string when there is nothing
 * to show so callers can skip the decoration entirely.
 */
export function formatDiffStats(additions: number, deletions: number): string {
	if (additions === 0 && deletions === 0) return "";
	if (additions === 0) return `−${deletions}`;
	if (deletions === 0) return `+${additions}`;
	return `+${additions} −${deletions}`;
}
