interface DiffStatTextProps {
	additions: number;
	deletions: number;
}

/**
 * The +N/−N pair used by file rows and section headers. One component so the
 * glyphs (true minus, matching pierreTree's formatDiffStats) and colors
 * can't drift between the two surfaces. Renders nothing at 0/0.
 */
export function DiffStatText({ additions, deletions }: DiffStatTextProps) {
	if (additions <= 0 && deletions <= 0) return null;
	return (
		<>
			{additions > 0 && <span className="text-green-400">+{additions}</span>}
			{additions > 0 && deletions > 0 && " "}
			{deletions > 0 && <span className="text-red-400">−{deletions}</span>}
		</>
	);
}
