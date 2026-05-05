import {
	type ParsedGitHubRemote,
	parseGitHubRemote,
} from "@superset/shared/github-remote";
import type { SimpleGit } from "simple-git";

export type { ParsedGitHubRemote };

/**
 * Map of remote name → URL, read from git config.
 *
 * Avoids `git remote -v`: that output appends partial-clone markers like
 * `[blob:none]` after `(fetch)` when `remote.<name>.promisor` is set, and is
 * otherwise human-readable rather than machine-stable.
 */
export async function getAllRemoteUrls(
	git: SimpleGit,
): Promise<Map<string, string>> {
	const remotes = new Map<string, string>();
	const output = await git
		.raw(["config", "--get-regexp", "^remote\\..*\\.url$"])
		.catch(() => "");

	for (const line of output.split(/\r?\n/)) {
		const spaceIdx = line.indexOf(" ");
		if (spaceIdx <= 0) continue;
		const key = line.slice(0, spaceIdx);
		const url = line.slice(spaceIdx + 1);
		// Greedy `.+` so a remote literally named `foo.url` resolves to
		// `foo.url`, not `foo`.
		const remoteName = key.match(/^remote\.(.+)\.url$/)?.[1];
		if (remoteName && url) {
			remotes.set(remoteName, url);
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
