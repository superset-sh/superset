import { resolve } from "node:path";
import type { SimpleGit } from "simple-git";

// The Changes panel diffs `<remote>/<base>...HEAD` but never fetches the base,
// so after a rebase onto a newer upstream the stale merge-base counts every
// upstream commit as a workspace change. This refreshes the base ref in the
// background; GitWatcher picks up the ref change and re-triggers the query.
const BASE_REF_FETCH_TTL_MS = 5 * 60_000;

export interface BaseRefFetchTarget {
	remote: string;
	branch: string;
}

// Keyed by common git dir so N worktrees of one repo share one TTL window.
// Bounded by (repo, base-ref) pairs, not workspace lifecycles.
const lastFetchStartedAt = new Map<string, number>();
const inFlightFetches = new Map<string, Promise<void>>();

// Resolved fresh, not path-cached: a worktree path can be reused by a
// different repo, and a stale mapping would key the dedup off the wrong repo
// and suppress a needed fetch.
async function resolveCommonDir(
	git: SimpleGit,
	worktreePath: string,
): Promise<string> {
	// `--git-common-dir` may print a path relative to the worktree root.
	const raw = (await git.raw(["rev-parse", "--git-common-dir"])).trim();
	return resolve(worktreePath, raw);
}

/**
 * Fetch the base branch's remote-tracking ref if the TTL has lapsed. Failures
 * consume the TTL too, so an unreachable remote isn't retried every poll.
 * Fire-and-forget (the status path never awaits); the returned promise never
 * rejects and exists only so tests can await it.
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
