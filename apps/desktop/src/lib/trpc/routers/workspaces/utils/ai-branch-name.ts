import { deriveWorkspaceBranchFromPrompt } from "@superset/shared/workspace-launch";

const MAX_CONFLICT_RESOLUTION_ATTEMPTS = 1000;
const INITIAL_CONFLICT_SUFFIX = 2;

function hasConflict(
	branchName: string,
	existingBranchesSet: Set<string>,
): boolean {
	return existingBranchesSet.has(branchName.toLowerCase());
}

function resolveConflict(
	baseName: string,
	existingBranches: string[],
	branchPrefix: string | undefined,
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

/**
 * Branch name derived from the prompt text, deduplicated against the
 * branches that already exist. Naming happens on this machine and the
 * prompt is never sent anywhere.
 */
export function generateBranchNameFromPrompt(
	prompt: string,
	existingBranches: string[],
	branchPrefix?: string,
): string | null {
	const derived = deriveWorkspaceBranchFromPrompt(prompt);
	if (!derived) return null;
	return resolveConflict(derived, existingBranches, branchPrefix);
}
