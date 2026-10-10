import type { Octokit } from "@octokit/rest";
import type { SimpleGit } from "simple-git";
import { z } from "zod";
import type { ParsedGitHubRemote } from "../../project/utils/git-remote";
import type { ExecGh } from "../utils/exec-gh";

export interface GithubRepoRef {
	owner: string;
	name: string;
}

/**
 * The repo `gh repo set-default` chose, read from the
 * `remote.<name>.gh-resolved` key it writes. `base` marks that remote as the
 * base repo; any other value is an `OWNER/REPO` slug.
 */
export async function getGhDefaultRepo(
	git: SimpleGit,
	remotes: Map<string, ParsedGitHubRemote>,
): Promise<GithubRepoRef | null> {
	const output = await git
		.raw(["config", "--get-regexp", "^remote\\..*\\.gh-resolved$"])
		.catch(() => "");

	for (const line of output.split(/\r?\n/)) {
		const spaceIdx = line.indexOf(" ");
		if (spaceIdx <= 0) continue;
		const remoteName = line
			.slice(0, spaceIdx)
			.match(/^remote\.(.+)\.gh-resolved$/)?.[1];
		const value = line.slice(spaceIdx + 1).trim();
		if (!remoteName || !value) continue;

		if (value === "base") {
			const remote = remotes.get(remoteName);
			if (remote) return { owner: remote.owner, name: remote.name };
			continue;
		}
		const [owner, name, ...rest] = value.split("/");
		if (owner && name && rest.length === 0) return { owner, name };
	}

	return null;
}

const repoParentSchema = z.object({
	parent: z
		.object({ name: z.string(), owner: z.object({ login: z.string() }) })
		.nullable()
		.optional(),
});

// A repo's fork parent never changes, so a hit is kept for the process.
const forkParentCache = new Map<string, GithubRepoRef | null>();

/**
 * The repo `repo` was forked from, or null when it isn't a fork. Tries `gh`,
 * then Octokit; throws when neither can reach GitHub, and that isn't cached.
 */
export async function getForkParent(
	repo: GithubRepoRef,
	clients: { execGh: ExecGh; github: () => Promise<Octokit> },
): Promise<GithubRepoRef | null> {
	const cacheKey = `${repo.owner}/${repo.name}`.toLowerCase();
	const cached = forkParentCache.get(cacheKey);
	if (cached !== undefined) return cached;

	let parsed: z.infer<typeof repoParentSchema>;
	try {
		parsed = repoParentSchema.parse(
			await clients.execGh(["api", `repos/${repo.owner}/${repo.name}`]),
		);
	} catch {
		const octokit = await clients.github();
		const { data } = await octokit.repos.get({
			owner: repo.owner,
			repo: repo.name,
		});
		parsed = repoParentSchema.parse(data);
	}

	const parent = parsed.parent
		? { owner: parsed.parent.owner.login, name: parsed.parent.name }
		: null;
	forkParentCache.set(cacheKey, parent);
	return parent;
}

export function resetForkParentCacheForTests(): void {
	forkParentCache.clear();
}
