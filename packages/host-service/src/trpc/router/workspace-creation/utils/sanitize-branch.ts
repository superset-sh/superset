/**
 * Branch name deduplication utility.
 *
 * Sanitization/slugification lives on the renderer — the host-service
 * only deduplicates against existing branches.
 */

const MAX_BRANCH_LENGTH = 100;
const SUFFIX_RESERVE = 6; // room for -99999

/**
 * Appends `-2`, `-3`, etc. until the name doesn't collide with
 * any existing branch (case-insensitive).
 *
 * Truncates the base name upfront to reserve space for the suffix,
 * so the result never exceeds MAX_BRANCH_LENGTH.
 */
export function deduplicateBranchName(
	candidate: string,
	existingBranchNames: string[],
): string {
	if (!candidate) return candidate;

	const existingSet = new Set(existingBranchNames.map((b) => b.toLowerCase()));
	if (!existingSet.has(candidate.toLowerCase())) return candidate;

	// Truncate base to leave room for suffix
	const base =
		candidate.length > MAX_BRANCH_LENGTH - SUFFIX_RESERVE
			? candidate
					.slice(0, MAX_BRANCH_LENGTH - SUFFIX_RESERVE)
					.replace(/[-.]+$/, "")
			: candidate;

	for (let suffix = 2; suffix < 10_000; suffix++) {
		const deduplicated = `${base}-${suffix}`;
		if (!existingSet.has(deduplicated.toLowerCase())) return deduplicated;
	}

	return `${base}-${Date.now().toString(36)}`;
}
