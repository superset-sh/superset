import { resolve } from "node:path";
import type { SimpleGit } from "simple-git";

// The Changes panel diffs `<remote>/<base>...HEAD`, but nothing in the status
// path fetches — the remote-tracking ref is only as fresh as the last fetch
// some other flow happened to run. Once a branch is rebased onto a newer
// upstream base, the stale merge-base counts every upstream commit as
// workspace changes. This refreshes the base ref in the background on a TTL;
// the ref update is picked up by GitWatcher, which re-triggers status queries.
const BASE_REF_FETCH_TTL_MS = 5 * 60_000;

export interface BaseRefFetchTarget {
	remote: string;
	branch: string;
}

// Keyed by the repo's common git dir so N worktrees of one repo share a
// single TTL window instead of each fetching independently. Bounded by
// distinct (repo, base-ref) pairs, not by workspace lifecycles.
const lastFetchStartedAt = new Map<string, number>();
const inFlightFetches = new Map<string, Promise<void>>();

// Resolved fresh each call rather than cached by path: a worktree path can be
// reused by a different repo over the host-service's lifetime, and a stale
// path→dir mapping would key the fetch dedup wrong and suppress a needed
// fetch. `rev-parse --git-common-dir` is a local, near-instant call, dwarfed
// by the `git fetch` it precedes.
async function resolveCommonDir(
	git: SimpleGit,
	worktreePath: string,
): Promise<string> {
	// `--git-common-dir` may print a path relative to the worktree root.
	const raw = (await git.raw(["rev-parse", "--git-common-dir"])).trim();
	return resolve(worktreePath, raw);
}

/**
 * Fetch the base branch's remote-tracking ref if the TTL for this repo+ref
 * has lapsed. Failures (offline, missing remote branch) consume the TTL
 * window too, so an unreachable remote is retried at the same cadence instead
 * of on every status poll.
 *
 * Callers use this fire-and-forget (the status path never awaits it); the
 * returned promise, which never rejects, exists so it can be awaited in tests.
 */
export function scheduleBaseRefFetch(
	git: SimpleGit,
	worktreePath: string,
	target: BaseRefFetchTarget,
): Promise<void> {
	return (async () => {
		const commonDir = await resolveCommonDir(git, worktreePath);
		const key = `${commonDir}#${target.remote}/${target.branch}`;

		const inFlight = inFlightFetches.get(key);
		if (inFlight) return inFlight;

		const last = lastFetchStartedAt.get(key);
		if (last !== undefined && Date.now() - last < BASE_REF_FETCH_TTL_MS) {
			return;
		}

		lastFetchStartedAt.set(key, Date.now());
		const fetchPromise = git
			.fetch([target.remote, target.branch, "--quiet", "--no-tags"])
			.then(() => undefined)
			.finally(() => {
				inFlightFetches.delete(key);
			});
		inFlightFetches.set(key, fetchPromise);
		return fetchPromise;
	})().catch((error) => {
		console.warn("[host-service:git] Background base-ref fetch failed", {
			worktreePath,
			remote: target.remote,
			branch: target.branch,
			error,
		});
	});
}
