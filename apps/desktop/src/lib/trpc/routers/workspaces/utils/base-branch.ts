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
	const rawDefault = normalizeBranch(defaultBranch) ?? "main";
	// Default to origin/<branch> so new workspaces base off the remote tracking
	// branch rather than a potentially stale local checkout.
	const fallbackBranch = rawDefault.includes("/")
		? rawDefault
		: `origin/${rawDefault}`;
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
