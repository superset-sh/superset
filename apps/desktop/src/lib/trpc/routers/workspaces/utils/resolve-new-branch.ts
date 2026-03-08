import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";
import { generateSlug } from "shared/utils/slug";
import { generateBranchName as generateRandomBranchName } from "./git";

export interface ResolveNewWorkspaceBranchParams {
	/** Already-validated branch name when useExistingBranch is set */
	existingBranchName?: string;
	/** Explicit branch name provided by the user or agent */
	branchName?: string;
	/** Workspace display name — used to derive a branch when no branchName given */
	name?: string;
	/** All branches currently known in the repo (for collision avoidance) */
	existingBranches: string[];
	/** Optional author/username prefix (e.g. "john" → "john/my-feature-a8f3") */
	branchPrefix?: string;
}

/**
 * Resolves the git branch name for a new workspace according to the following
 * priority order:
 *
 * 1. `existingBranchName` — already checked-out branch (useExistingBranch flow)
 * 2. `branchName`         — explicit branch name supplied by the caller
 * 3. `name`               — workspace display name; slug-ified into a branch
 * 4. fallback             — random friendly-words name (no name context)
 */
export function resolveNewWorkspaceBranch({
	existingBranchName,
	branchName,
	name,
	existingBranches,
	branchPrefix,
}: ResolveNewWorkspaceBranchParams): string {
	const withPrefix = (n: string): string =>
		branchPrefix ? `${branchPrefix}/${n}` : n;

	// 1. Use the existing (already-checked-out) branch as-is.
	if (existingBranchName) {
		return existingBranchName;
	}

	// 2. Explicit branch name provided — sanitize and apply prefix.
	if (branchName?.trim()) {
		return sanitizeBranchNameWithMaxLength(withPrefix(branchName), undefined, {
			preserveFirstSegmentCase: true,
		});
	}

	// 3. Derive branch from workspace display name.
	if (name?.trim()) {
		const slug = generateSlug(name.trim());
		return sanitizeBranchNameWithMaxLength(withPrefix(slug), undefined, {
			preserveFirstSegmentCase: true,
		});
	}

	// 4. Fallback: random friendly-words name.
	return generateRandomBranchName({
		existingBranches,
		authorPrefix: branchPrefix,
	});
}
