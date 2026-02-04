/**
 * Get the most recently opened workspace path from grouped workspaces.
 */
export function getMostRecentWorkspacePath(
	groups: Array<{
		workspaces: Array<{
			worktreePath: string;
			lastOpenedAt: number;
		}>;
	}>,
): string | null {
	const allWorkspaces = groups.flatMap((g) => g.workspaces);
	if (allWorkspaces.length === 0) return null;

	const sorted = [...allWorkspaces].sort(
		(a, b) => b.lastOpenedAt - a.lastOpenedAt,
	);
	return sorted[0].worktreePath || null;
}
