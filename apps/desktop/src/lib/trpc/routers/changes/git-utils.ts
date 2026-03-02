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
