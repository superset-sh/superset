interface ChangedFileStats {
	path: string;
	additions: number;
	deletions: number;
}

interface ChangesPillInput {
	againstBase: ChangedFileStats[];
	staged: ChangedFileStats[];
	unstaged: ChangedFileStats[];
}

export interface ChangesPillStats {
	fileCount: number;
	additions: number;
	deletions: number;
}

/**
 * Unique-path totals for the top-bar pill. Working-tree entries override the
 * against-base row for the same path (and unstaged overrides staged) — the
 * same precedence the host uses for workspace-list diff stats and the
 * Changes pane's tree dedupe, so a path counts once with its most current
 * numbers instead of double-counting across sections.
 */
export function changesPillStats(status: ChangesPillInput): ChangesPillStats {
	const byPath = new Map<string, ChangedFileStats>();
	for (const list of [status.againstBase, status.staged, status.unstaged]) {
		for (const file of list) {
			byPath.set(file.path, file);
		}
	}
	let additions = 0;
	let deletions = 0;
	for (const file of byPath.values()) {
		additions += file.additions;
		deletions += file.deletions;
	}
	return { fileCount: byPath.size, additions, deletions };
}
