interface BranchLike {
	name: string;
}

interface ResolveEffectiveWorkspaceBaseBranchParams {
	explicitBaseBranch?: string | null;
	workspaceBaseBranch?: string | null;
	defaultBranch?: string | null;
	branches?: BranchLike[];
}

function normalizeBranch(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export function resolveEffectiveWorkspaceBaseBranch({
	explicitBaseBranch,
	workspaceBaseBranch,
	defaultBranch,
	branches,
}: ResolveEffectiveWorkspaceBaseBranchParams): string | null {
	const explicit = normalizeBranch(explicitBaseBranch);
	if (explicit) {
		return explicit;
	}

	const preferred = normalizeBranch(workspaceBaseBranch);
	if (preferred) {
		if (!branches) {
			return preferred;
		}
		if (branches.some((branch) => branch.name === preferred)) {
			return preferred;
		}
	}

	return normalizeBranch(defaultBranch);
}
