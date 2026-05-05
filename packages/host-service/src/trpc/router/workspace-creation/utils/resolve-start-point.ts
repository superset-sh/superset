import type { SimpleGit } from "simple-git";
import {
	asLocalRef,
	asRemoteRef,
	type ResolvedRef,
	resolveDefaultBranchName,
} from "../../../../runtime/git/refs";

async function refExists(git: SimpleGit, fullRef: string): Promise<boolean> {
	try {
		// See refs.ts — `--quiet` makes simple-git's `raw` mis-resolve a
		// missing ref as success with empty stdout. Drop it; verify a sha
		// was actually printed.
		const out = await git.raw(["rev-parse", "--verify", `${fullRef}^{commit}`]);
		return /^[0-9a-f]{40,}/.test(out.trim());
	} catch {
		return false;
	}
}

/**
 * Resolve the best start point for a new worktree. Prefers a local branch
 * when it exists, falls back to a remote-tracking ref, then HEAD.
 *
 * Why local-first: users pick branches from a list of refs they can see
 * locally — they expect to fork from that exact local state, not from a
 * remote ref that may be stale (deleted upstream, missed prune, points at
 * a pruned commit). Workspace branches in particular are local-only and
 * an incidental `refs/remotes/origin/<name>` cache (from a one-off push
 * etc.) would silently win and then break `git worktree add`.
 *
 * Picker-side `refresh` already runs `git fetch --prune` on modal open,
 * so remote staleness for branches we *do* want fresh is bounded.
 *
 * Probes use full refnames so a local branch literally named `origin/foo`
 * cannot be misclassified as remote-tracking. Callers switch on
 * `result.kind` — see `GIT_REFS.md`.
 */
export async function resolveStartPoint(
	git: SimpleGit,
	baseBranch: string | undefined,
): Promise<ResolvedRef> {
	const branch = baseBranch?.trim() || (await resolveDefaultBranchName(git));
	const remote = "origin";

	const localRef = asLocalRef(branch);
	if (await refExists(git, localRef)) {
		return { kind: "local", fullRef: localRef, shortName: branch };
	}

	const remoteRef = asRemoteRef(remote, branch);
	if (await refExists(git, remoteRef)) {
		return {
			kind: "remote-tracking",
			fullRef: remoteRef,
			shortName: branch,
			remote,
			remoteShortName: `${remote}/${branch}`,
		};
	}

	return { kind: "head" };
}
