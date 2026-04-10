/**
 * Branch name deduplication utility.
 *
 * Sanitization/slugification lives on the renderer — the host-service
 * only deduplicates against existing branches.
 */

/**
 * Appends `-2`, `-3`, etc. until the name doesn't collide with
 * any existing branch (case-insensitive).
 */
export function deduplicateBranchName(
	candidate: string,
	existingBranchNames: string[],
): string {
	if (!candidate) return candidate;

	const existingSet = new Set(existingBranchNames.map((b) => b.toLowerCase()));
	if (!existingSet.has(candidate.toLowerCase())) return candidate;

	for (let suffix = 2; suffix < 10_000; suffix++) {
		const deduplicated = `${candidate}-${suffix}`;
		if (!existingSet.has(deduplicated.toLowerCase())) return deduplicated;
	}

	return `${candidate}-${Date.now()}`;
}
