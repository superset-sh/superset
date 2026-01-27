export function sanitizeSegment(text: string, maxLength = 50): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, maxLength);
}

export function sanitizeAuthorPrefix(name: string): string {
	return sanitizeSegment(name);
}

export function sanitizeBranchName(name: string): string {
	return name
		.split("/")
		.map((s) => sanitizeSegment(s))
		.filter(Boolean)
		.join("/");
}

/**
 * Checks if a new branch name would conflict with existing branches due to
 * Git's ref storage using file/directory structure.
 *
 * Git stores branches as files in .git/refs/heads/. This means:
 * - If "release" exists as a branch (file at refs/heads/release), you cannot
 *   create "release/v1" (which would need refs/heads/release/ as a directory)
 * - If "release/v1" exists, you cannot create "release" (same conflict)
 *
 * @param newBranch - The branch name to create
 * @param existingBranches - List of existing branch names
 * @returns The conflicting branch name if found, null otherwise
 */
export function findBranchPathConflict(
	newBranch: string,
	existingBranches: string[],
): string | null {
	const newBranchLower = newBranch.toLowerCase();

	for (const existing of existingBranches) {
		const existingLower = existing.toLowerCase();

		// Check if the new branch would be a "child" of an existing branch
		// e.g., creating "release/v61" when "release" exists
		if (newBranchLower.startsWith(`${existingLower}/`)) {
			return existing;
		}

		// Check if the new branch would be a "parent" of an existing branch
		// e.g., creating "release" when "release/v61" exists
		if (existingLower.startsWith(`${newBranchLower}/`)) {
			return existing;
		}
	}

	return null;
}
