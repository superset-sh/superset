import { resolve } from "node:path";
import type { SimpleGit } from "simple-git";

// The Changes panel diffs `<remote>/<base>...HEAD` but never fetches the base,
// so after a rebase onto a newer upstream the stale merge-base counts every
// upstream commit as a workspace change. This refreshes the base ref in the
// background. Remote-tracking refs live in the common git dir, which
// GitWatcher does not watch for a linked worktree, so the caller must
// invalidate status itself when this resolves true.
const BASE_REF_FETCH_TTL_MS = 5 * 60_000;

export interface BaseRefFetchTarget {
	remote: string;
	branch: string;
}

// Keyed by common git dir so N worktrees of one repo share one TTL window.
// Bounded by (repo, base-ref) pairs, not workspace lifecycles.
const lastFetchStartedAt = new Map<string, number>();
const inFlightFetches = new Map<string, Promise<boolean>>();

// TTL-cached per worktree path: resolving spawns a git subprocess on the
// event loop BEFORE the fetch-TTL check, i.e. every status poll pays it even
// when the fetch is suppressed. A worktree path re-pointed at a different
// repo within the TTL only mis-keys the dedupe entry (one extra or one
// suppressed fetch, bounded by the TTL) — the fetch itself always runs in
// `worktreePath`, so it can never hit the wrong repo.
const COMMON_DIR_TTL_MS = 5 * 60_000;
const commonDirCache = new Map<string, { dir: string; resolvedAt: number }>();

async function resolveCommonDir(
	git: SimpleGit,
	worktreePath: string,
): Promise<string> {
	const cached = commonDirCache.get(worktreePath);
	if (cached && Date.now() - cached.resolvedAt < COMMON_DIR_TTL_MS) {
		return cached.dir;
	}
	// `--git-common-dir` may print a path relative to the worktree root.
	const raw = (await git.raw(["rev-parse", "--git-common-dir"])).trim();
	const dir = resolve(worktreePath, raw);
	commonDirCache.set(worktreePath, { dir, resolvedAt: Date.now() });
	return dir;
}

/**
 * Fetch the base branch's remote-tracking ref if the TTL has lapsed. Failures
 * consume the TTL too, so an unreachable remote isn't retried every poll.
 * The status path never awaits it. The promise never rejects and resolves
 * true when a fetch (this call's or the in-flight one it joined) succeeded.
 */
export function scheduleBaseRefFetch(
	git: SimpleGit,
	worktreePath: string,
	target: BaseRefFetchTarget,
	fetchBaseRef: () => Promise<unknown> = () =>
		git.fetch([target.remote, target.branch, "--quiet", "--no-tags"]),
): Promise<boolean> {
	return (async () => {
		const commonDir = await resolveCommonDir(git, worktreePath);
		const key = `${commonDir}#${target.remote}/${target.branch}`;

		const inFlight = inFlightFetches.get(key);
		if (inFlight) return inFlight;

		const last = lastFetchStartedAt.get(key);
		if (last !== undefined && Date.now() - last < BASE_REF_FETCH_TTL_MS) {
			return false;
		}

		lastFetchStartedAt.set(key, Date.now());
		const fetchPromise = fetchBaseRef()
			.then(() => true)
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
		return false;
	});
}
