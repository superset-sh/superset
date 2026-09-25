/**
 * Check if the error message indicates the upstream branch is missing/deleted
 */
export function isUpstreamMissingError(message: string): boolean {
	return (
		message.includes("no such ref was fetched") ||
		message.includes("no tracking information") ||
		message.includes("couldn't find remote ref") ||
		message.includes("cannot be resolved to branch")
	);
}

/**
 * Check if the error message indicates a rebase/merge conflict — an expected
 * outcome of pulling into a branch with divergent local commits
 */
export function isMergeConflictError(message: string): boolean {
	return (
		message.includes("CONFLICT (") ||
		message.includes("Merge conflict in") ||
		message.includes("could not apply") ||
		message.includes("Resolve all conflicts manually")
	);
}

export function isNoPullRequestFoundMessage(message: string): boolean {
	return message.toLowerCase().includes("no pull request");
}
