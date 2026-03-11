export function buildCreateWorkspaceFromBranchInput(
	projectId: string,
	branchName: string,
) {
	return {
		projectId,
		branchName,
		useExistingBranch: true,
		applyPrefix: false,
	} as const;
}
