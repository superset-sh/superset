import {
	type ParsedGitHubRemote,
	parseGitHubRemote,
} from "@superset/shared/github-remote";
import type { SimpleGit } from "simple-git";

export type { ParsedGitHubRemote };

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

	for (const line of output.trim().split(/\r?\n/)) {
		const match = line.trim().match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
		if (match?.[1] && match[2]) {
			remotes.set(match[1], match[2]);
		}
	}

	return remotes;
}

/**
 * Parse all fetch remotes and return only GitHub ones as parsed objects.
 * Returns a map of remote name → ParsedGitHubRemote.
 */
export async function getGitHubRemotes(
	git: SimpleGit,
): Promise<Map<string, ParsedGitHubRemote>> {
	const rawRemotes = await getAllRemoteUrls(git);
	const parsed = new Map<string, ParsedGitHubRemote>();

	for (const [name, url] of rawRemotes) {
		const result = parseGitHubRemote(url);
		if (result) {
			parsed.set(name, result);
		}
	}

	return parsed;
}

/**
 * Check if any remote matches the expected GitHub owner/repo slug.
 * Returns the name of the matching remote, or null if none match.
 */
export function findMatchingRemote(
	remotes: Map<string, ParsedGitHubRemote>,
	expectedSlug: string,
): string | null {
	const normalized = expectedSlug.toLowerCase();
	for (const [name, parsed] of remotes) {
		const slug = `${parsed.owner}/${parsed.name}`;
		if (slug.toLowerCase() === normalized) {
			return name;
		}
	}
	return null;
}
