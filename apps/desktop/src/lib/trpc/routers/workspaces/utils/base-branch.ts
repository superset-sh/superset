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

/**
 * The PR's own base branch, when the repo can actually compare against it.
 * The changes view diffs against `origin/<base>` and reports a failed diff as
 * an empty one, so a base with no remote-tracking ref — including one that
 * exists only as a local branch — is dropped rather than showing the
 * workspace as having no changes. Dropping it hands the choice back to
 * `resolveWorkspaceBaseBranch`, which is what non-PR workspaces already use.
 *
 * `remoteBranches` carries remote-tracking names with "origin/" stripped;
 * undefined means git could not be read, where the PR's own base is still the
 * better guess.
 */
export function resolvePrBaseBranch({
	baseRefName,
	remoteBranches,
}: {
	baseRefName?: string;
	remoteBranches?: string[];
}): string | undefined {
	const base = normalizeBranch(baseRefName);
	if (!base) {
		return undefined;
	}
	if (remoteBranches && !remoteBranches.includes(base)) {
		return undefined;
	}
	return base;
}
