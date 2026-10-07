import { type ParsedRemote, parseGitRemote } from "@superset/shared/git-remote";
import {
	type ParsedGitHubRemote,
	parseGitHubRemote,
} from "@superset/shared/github-remote";
import {
	type RepositoryIdentity,
	repositoryIdentityKey,
} from "@superset/shared/repo-identity";
import type { SimpleGit } from "simple-git";

export type { ParsedGitHubRemote };

export async function getAllRepoRemotes(
	git: SimpleGit,
	canonicalWebUrl?: string | null,
): Promise<Array<[string, ParsedRemote]>> {
	const parsed: Array<[string, ParsedRemote]> = [];
	const canonical = canonicalWebUrl ? parseGitRemote(canonicalWebUrl) : null;
	for (const [name, urls] of await getAllRemoteUrls(git)) {
		for (const url of urls) {
			const remote = parseGitRemote(url);
			if (!remote) continue;
			if (
				canonical &&
				remote.provider !== "github" &&
				/^(?:ssh:\/\/|[^/:]+@[^:]+:)/i.test(url) &&
				remote.host === new URL(canonical.url).hostname
			) {
				remote.host = canonical.host;
				remote.url = `https://${canonical.host}/${remote.owner}/${remote.name}`;
			}
			parsed.push([name, remote]);
		}
	}
	return parsed;
}

export async function getRepoRemotes(
	git: SimpleGit,
	expectedUrl?: string | null,
): Promise<Map<string, ParsedRemote>> {
	const expected = expectedUrl ? parseGitRemote(expectedUrl) : null;
	const parsed = new Map<string, ParsedRemote>();
	for (const [name, remote] of await getAllRepoRemotes(git, expectedUrl)) {
		if (
			!parsed.has(name) ||
			(expected &&
				repositoryIdentityKey(remote) === repositoryIdentityKey(expected))
		)
			parsed.set(name, remote);
	}
	return parsed;
}

export function findMatchingRepoRemote(
	remotes: Iterable<[string, ParsedRemote]>,
	expected: RepositoryIdentity,
): string | null {
	const key = repositoryIdentityKey(expected);
	for (const [name, remote] of remotes) {
		if (repositoryIdentityKey(remote) === key) return name;
	}
	return null;
}

/**
 * Map of remote name → fetch URLs, read from git config.
 *
 * Avoids `git remote -v`: that output appends partial-clone markers like
 * `[blob:none]` after `(fetch)` when `remote.<name>.promisor` is set, and is
 * otherwise human-readable rather than machine-stable.
 */
export async function getAllRemoteUrls(
	git: SimpleGit,
): Promise<Map<string, string[]>> {
	const remotes = new Map<string, string[]>();
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
			const urls = remotes.get(remoteName) ?? [];
			urls.push(url);
			remotes.set(remoteName, urls);
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

	for (const [name, urls] of rawRemotes) {
		for (const url of urls) {
			const result = parseGitHubRemote(url);
			if (result && !parsed.has(name)) parsed.set(name, result);
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
