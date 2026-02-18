interface ResolveWorkspaceBaseBranchParams {
	explicitBaseBranch?: string;
	workspaceBaseBranch?: string | null;
	defaultBranch?: string | null;
	knownBranches?: string[];
}

function normalizeBranch(value?: string | null): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function resolveWorkspaceBaseBranch({
	explicitBaseBranch,
	workspaceBaseBranch,
	defaultBranch,
	knownBranches,
}: ResolveWorkspaceBaseBranchParams): string {
	const fallbackBranch = normalizeBranch(defaultBranch) ?? "main";
	const explicit = normalizeBranch(explicitBaseBranch);
	if (explicit) {
		return explicit;
	}

	const preferred = normalizeBranch(workspaceBaseBranch);
	if (!preferred) {
		return fallbackBranch;
	}

	if (knownBranches?.length) {
		const knownBranchSet = new Set(knownBranches);
		if (!knownBranchSet.has(preferred)) {
			return fallbackBranch;
		}
	}

	return preferred;
}
