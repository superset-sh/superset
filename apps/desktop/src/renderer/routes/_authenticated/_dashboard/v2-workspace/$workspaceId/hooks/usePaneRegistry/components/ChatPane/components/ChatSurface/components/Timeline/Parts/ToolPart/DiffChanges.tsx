/**
 * Compact +N -M badge for tool triggers (edit/write/apply-patch).
 * Ported from OpenCode's diff-changes.tsx — numeric variant only for
 * Phase 3.1. Block variant (5-block visual proportional fill) can come
 * later.
 */

export interface DiffChangesProps {
	additions: number;
	deletions: number;
}

export function DiffChanges({ additions, deletions }: DiffChangesProps) {
	if (additions <= 0 && deletions <= 0) return null;
	return (
		<span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px]">
			{additions > 0 && (
				<span className="text-green-600 dark:text-green-400">
					+{additions}
				</span>
			)}
			{deletions > 0 && (
				<span className="text-red-600 dark:text-red-400">-{deletions}</span>
			)}
		</span>
	);
}
