const MAX_CONFLICT_RESOLUTION_ATTEMPTS = 1000;
const INITIAL_CONFLICT_SUFFIX = 2;

function hasConflict(
	branchName: string,
	existingBranchesSet: Set<string>,
): boolean {
	return existingBranchesSet.has(branchName.toLowerCase());
}

/**
 * Returns a branch name that does not collide with `existingBranches`,
 * appending -2, -3, ... until one is free. Comparison happens on the
 * prefixed name, since that is what the branch will actually be called.
 */
export function deduplicateBranchName(
	baseName: string,
	existingBranches: string[],
	branchPrefix?: string,
): string {
	const prefixedBase = branchPrefix ? `${branchPrefix}/${baseName}` : baseName;
	const lowerPrefixedBase = prefixedBase.toLowerCase();
	const hasInitialConflict = existingBranches.some(
		(b) => b.toLowerCase() === lowerPrefixedBase,
	);

	if (!hasInitialConflict) {
		return baseName;
	}

	const existingSet = new Set(existingBranches.map((b) => b.toLowerCase()));

	let counter = INITIAL_CONFLICT_SUFFIX;
	let candidate = `${baseName}-${counter}`;
	let prefixedCandidate = branchPrefix
		? `${branchPrefix}/${candidate}`
		: candidate;

	while (hasConflict(prefixedCandidate, existingSet)) {
		counter++;
		if (counter > MAX_CONFLICT_RESOLUTION_ATTEMPTS) {
			throw new Error(
				`Could not find unique branch name after ${MAX_CONFLICT_RESOLUTION_ATTEMPTS} attempts`,
			);
		}
		candidate = `${baseName}-${counter}`;
		prefixedCandidate = branchPrefix
			? `${branchPrefix}/${candidate}`
			: candidate;
	}

	return candidate;
}
