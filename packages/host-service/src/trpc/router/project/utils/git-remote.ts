import type { SimpleGit } from "simple-git";

/**
 * Get all fetch remote URLs from a git repository.
 * Returns a map of remote name → fetch URL.
 */
export async function getAllRemoteUrls(
	git: SimpleGit,
): Promise<Map<string, string>> {
	const remotes = new Map<string, string>();
	const output = await git.remote(["-v"]);
	if (!output) return remotes;

	for (const line of output.trim().split("\n")) {
		const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
		if (match?.[1] && match[2]) {
			remotes.set(match[1], match[2]);
		}
	}

	return remotes;
}

/**
 * Extract the GitHub owner/repo slug from a git remote URL.
 * Handles both SSH and HTTPS formats:
 *   - git@github.com:org/repo.git  → org/repo
 *   - https://github.com/org/repo.git → org/repo
 *   - https://github.com/org/repo → org/repo
 */
export function extractGitHubSlug(remoteUrl: string): string | null {
	// SSH format: git@github.com:owner/repo.git
	const sshMatch = remoteUrl.match(
		/^[\w.-]+@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/,
	);
	if (sshMatch?.[1]) return sshMatch[1];

	// HTTPS format: https://github.com/owner/repo.git
	const httpsMatch = remoteUrl.match(
		/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/,
	);
	if (httpsMatch?.[1]) return httpsMatch[1];

	return null;
}

/**
 * Check if any remote in the map matches the expected GitHub owner/repo slug.
 * Returns the name of the matching remote, or null if none match.
 */
export function findMatchingRemote(
	remotes: Map<string, string>,
	expectedSlug: string,
): string | null {
	const normalized = expectedSlug.toLowerCase();
	for (const [name, url] of remotes) {
		const slug = extractGitHubSlug(url);
		if (slug && slug.toLowerCase() === normalized) {
			return name;
		}
	}
	return null;
}
