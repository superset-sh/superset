export interface PRActionStateInput {
	hasRepo: boolean;
	hasExistingPR: boolean;
	hasUpstream: boolean;
	pushCount: number;
	pullCount: number;
	isDefaultBranch: boolean;
}

export interface PRActionState {
	canCreatePR: boolean;
	createPRBlockedReason: string | null;
}

export function getPRActionState({
	hasRepo,
	hasExistingPR,
	hasUpstream,
	pushCount,
	pullCount,
	isDefaultBranch,
}: PRActionStateInput): PRActionState {
	if (hasExistingPR) {
		return { canCreatePR: false, createPRBlockedReason: null };
	}

	if (!hasRepo) {
		return {
			canCreatePR: false,
			createPRBlockedReason: "GitHub is not available for this workspace.",
		};
	}

	if (isDefaultBranch) {
		return {
			canCreatePR: false,
			createPRBlockedReason:
				"Cannot create a pull request from the default branch.",
		};
	}

	if (!hasUpstream) {
		return {
			canCreatePR: false,
			createPRBlockedReason:
				"Publish this branch before creating a pull request.",
		};
	}

	if (pushCount > 0 || pullCount > 0) {
		return {
			canCreatePR: false,
			createPRBlockedReason:
				"Sync this branch with its upstream before creating a pull request.",
		};
	}

	return { canCreatePR: true, createPRBlockedReason: null };
}
