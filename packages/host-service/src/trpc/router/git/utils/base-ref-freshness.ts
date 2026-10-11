import { resolve } from "node:path";
import type { SimpleGit } from "simple-git";

// The Changes panel diffs `<remote>/<base>...HEAD` but never fetches the base,
// so after a rebase onto a newer upstream the stale merge-base counts every
// upstream commit as a workspace change. This refreshes the base ref in the
// background. Remote-tracking refs live in the common git dir, which
// GitWatcher does not watch for a linked worktree, so the caller must
// invalidate the status of every workspace this returns.
const BASE_REF_FETCH_TTL_MS = 5 * 60_000;

export interface BaseRefFetchTarget {
	remote: string;
	branch: string;
}

export interface BaseRefReader {
	workspaceId: string;
	/** When the snapshot that resolved this base ref started computing. */
	snapshotStartedAt: number;
}

// Keyed by common git dir so N worktrees of one repo share one fetch.
// `readers` holds every workspace whose status was computed against the ref,
// so a fetch started by one worktree refreshes all of them. Bounded by
// (repo, base-ref) pairs times the workspaces that read them.
interface BaseRefState {
	lastFetchStartedAt?: number;
	lastRefMovedAt?: number;
	inFlight?: Promise<string[]>;
	readers: Set<string>;
}
const baseRefStates = new Map<string, BaseRefState>();

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

function readRemoteRef(
	git: SimpleGit,
	target: BaseRefFetchTarget,
): Promise<string> {
	return git
		.raw([
			"rev-parse",
			"--verify",
			"--quiet",
			`refs/remotes/${target.remote}/${target.branch}`,
		])
		.then(
			(output) => output.trim(),
			() => "",
		);
}

/**
 * Fetch the base branch's remote-tracking ref if the TTL has lapsed. Failures
 * consume the TTL too, so an unreachable remote isn't retried every poll.
 * The status path never awaits it. Never rejects; resolves to the workspaces
 * whose cached status predates a move of the ref.
 */
export function scheduleBaseRefFetch(
	git: SimpleGit,
	worktreePath: string,
	target: BaseRefFetchTarget,
	reader: BaseRefReader,
	fetchBaseRef: () => Promise<unknown> = () =>
		git.fetch([target.remote, target.branch, "--quiet", "--no-tags"]),
): Promise<string[]> {
	return (async () => {
		const commonDir = await resolveCommonDir(git, worktreePath);
		const key = `${commonDir}#${target.remote}/${target.branch}`;
		let state = baseRefStates.get(key);
		if (!state) {
			state = { readers: new Set() };
			baseRefStates.set(key, state);
		}
		state.readers.add(reader.workspaceId);

		// The in-flight fetch reports every reader, this one included.
		if (state.inFlight) {
			await state.inFlight;
			return [];
		}

		const last = state.lastFetchStartedAt;
		if (last !== undefined && Date.now() - last < BASE_REF_FETCH_TTL_MS) {
			// A fetch that landed while this snapshot was computing finished
			// before this reader registered, so it was not reported.
			const movedAt = state.lastRefMovedAt;
			return movedAt !== undefined && movedAt >= reader.snapshotStartedAt
				? [reader.workspaceId]
				: [];
		}

		const owned = state;
		owned.lastFetchStartedAt = Date.now();
		owned.inFlight = (async () => {
			const before = await readRemoteRef(git, target);
			await fetchBaseRef();
			if ((await readRemoteRef(git, target)) === before) return [];
			owned.lastRefMovedAt = Date.now();
			return [...owned.readers];
		})().finally(() => {
			owned.inFlight = undefined;
		});
		return owned.inFlight;
	})().catch((error) => {
		console.warn("[host-service:git] Background base-ref fetch failed", {
			worktreePath,
			remote: target.remote,
			branch: target.branch,
			error,
		});
		return [];
	});
}
