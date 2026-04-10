export interface BranchRowStateInput {
	hasActiveWorkspace: boolean;
	hasOpenableWorktree: boolean;
	hasBranchWorktree: boolean;
}

export interface BranchRowStateOutput {
	showOpen: boolean;
	showCreate: boolean;
}

export function resolveBranchRowState({
	hasActiveWorkspace,
	hasOpenableWorktree,
	hasBranchWorktree,
}: BranchRowStateInput): BranchRowStateOutput {
	const showOpen = hasActiveWorkspace || hasOpenableWorktree;
	const showCreate = !hasBranchWorktree;
	return { showOpen, showCreate };
}
