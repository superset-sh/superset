export interface WorktreeDeletePresentation {
	actionLabel: "Remove worktree" | "Delete worktree";
	actionVerb: "Remove" | "Delete";
	isImported: boolean;
	isUnknown: boolean;
	removesFilesFromDisk: boolean;
}

export function getWorktreeDeletePresentation(
	createdBySuperset: boolean | null | undefined,
): WorktreeDeletePresentation {
	switch (createdBySuperset) {
		case true:
			return {
				actionLabel: "Delete worktree",
				actionVerb: "Delete",
				isImported: false,
				isUnknown: false,
				removesFilesFromDisk: true,
			};
		case false:
			return {
				actionLabel: "Remove worktree",
				actionVerb: "Remove",
				isImported: true,
				isUnknown: false,
				removesFilesFromDisk: false,
			};
		default:
			return {
				actionLabel: "Remove worktree",
				actionVerb: "Remove",
				isImported: false,
				isUnknown: true,
				removesFilesFromDisk: false,
			};
	}
}
