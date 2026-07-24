import {
	asRemoteRef,
	type ResolvedRef,
	resolveUpstream,
} from "../../../../runtime/git/refs";
import type { GitClient } from "../shared/types";
import { resolveStartPoint } from "./resolve-start-point";

/**
 * Resolve the start point a *new* branch should fork from. No
 * `resolveRef(branch)` check — callers are responsible for guaranteeing
 * the branch name is fresh (e.g. via `deduplicateBranchName`). Useful
 * when the branch name is being chosen at the same time the start point
 * is resolved (auto-gen + AI naming path), so it can run in parallel
 * with the LLM call.
 *
 * Local refs of *any* base branch go stale — not just the default. If
 * `main` gets `git fetch`ed regularly but a shared branch like
 * `mirror-flier` hasn't been touched in weeks, forking from local
 * `mirror-flier` silently produces a workspace weeks behind current
 * work. So we upgrade local→remote-tracking + fetch whenever the base
 * has a configured upstream, regardless of whether it's the default.
 */
export async function resolveNewBranchStartPoint(
	git: GitClient,
	baseBranch: string | undefined,
): Promise<ResolvedRef> {
	let startPoint = await resolveStartPoint(git, baseBranch);

	if (startPoint.kind === "local") {
		const upstream = await resolveUpstream(git, startPoint.shortName);
		if (upstream) {
			const remoteRef = asRemoteRef(upstream.remote, upstream.remoteBranch);
			// `--quiet` confuses simple-git's `raw` (resolves on missing
			// refs with empty stdout). Drop it; verify a sha was printed.
			const remoteExists = await git
				.raw(["rev-parse", "--verify", `${remoteRef}^{commit}`])
				.then((out) => /^[0-9a-f]{40,}/.test(out.trim()))
				.catch(() => false);
			if (remoteExists) {
				startPoint = {
					kind: "remote-tracking",
					fullRef: remoteRef,
					shortName: upstream.remoteBranch,
					remote: upstream.remote,
					remoteShortName: `${upstream.remote}/${upstream.remoteBranch}`,
				};
			}
		}
	}

	if (startPoint.kind === "remote-tracking") {
		try {
			await git.fetch([
				startPoint.remote,
				startPoint.shortName,
				"--quiet",
				"--no-tags",
			]);
		} catch (err) {
			console.warn(
				`[workspaces.create] fetch ${startPoint.remoteShortName} failed:`,
				err,
			);
		}
	}

	return startPoint;
}
