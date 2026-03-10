export type ResolvedBranchAction =
	| {
			kind: "open-workspace";
			workspaceId: string;
	  }
	| {
			kind: "open-worktree";
			worktreeId: string;
	  }
	| {
			kind: "import-worktree";
			worktreePath: string;
	  }
	| {
			kind: "create-workspace";
	  };

interface ResolveBranchActionInput {
	branchName: string;
	workspaceByBranch: ReadonlyMap<string, string>;
	trackedWorktreeByBranch: ReadonlyMap<
		string,
		{ worktreeId: string; existsOnDisk: boolean }
	>;
	externalWorktreeByBranch: ReadonlyMap<string, { path: string }>;
}

export function resolveBranchAction({
	branchName,
	workspaceByBranch,
	trackedWorktreeByBranch,
	externalWorktreeByBranch,
}: ResolveBranchActionInput): ResolvedBranchAction {
	const workspaceId = workspaceByBranch.get(branchName);
	if (workspaceId) {
		return {
			kind: "open-workspace",
			workspaceId,
		};
	}

	const trackedWorktree = trackedWorktreeByBranch.get(branchName);
	if (trackedWorktree?.existsOnDisk) {
		return {
			kind: "open-worktree",
			worktreeId: trackedWorktree.worktreeId,
		};
	}

	const externalWorktree = externalWorktreeByBranch.get(branchName);
	if (externalWorktree) {
		return {
			kind: "import-worktree",
			worktreePath: externalWorktree.path,
		};
	}

	return {
		kind: "create-workspace",
	};
}
