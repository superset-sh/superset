export interface OpenWorkspaceTarget {
	branchName: string;
	worktreePath?: string;
}

interface OpenWorkspaceBranch {
	name: string;
	worktreePath?: string | null;
}

export function toOpenWorkspaceTarget(
	branch: OpenWorkspaceBranch,
): OpenWorkspaceTarget {
	return branch.worktreePath
		? { branchName: branch.name, worktreePath: branch.worktreePath }
		: { branchName: branch.name };
}
