import {
	asLocalRef,
	asRemoteRef,
	type ResolvedRef,
	resolveDefaultBranchName,
	resolveUpstream,
} from "../../../../runtime/git/refs";
import type { BaseRefFetchTarget } from "../../git/utils/base-ref-freshness";
import type { GitClient } from "../shared/types";

export type BaseRefFetcher = (target: BaseRefFetchTarget) => Promise<unknown>;
export interface CachedBase {
	ref: string;
	commit: string;
}
export class BaseRefreshError extends Error {
	constructor(
		public readonly ref: string,
		public readonly cachedCommit: string | null,
		public readonly cachedCommitTime: number | null,
		cause: unknown,
	) {
		super(`Could not refresh ${ref}. Retry or choose another base.`, { cause });
		this.name = "BaseRefreshError";
	}
}
async function commitAt(git: GitClient, ref: string): Promise<string | null> {
	return git
		.raw(["rev-parse", "--verify", `${ref}^{commit}`])
		.then((out) =>
			/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(out.trim()) ? out.trim() : null,
		)
		.catch(() => null);
}

/** New branches pin the fetched commit. Existing-branch attachment bypasses this. */
export async function resolveNewBranchStartPoint(
	git: GitClient,
	baseBranch: string | undefined,
	fetchRemoteRef: BaseRefFetcher = (target) =>
		git.fetch([
			"--quiet",
			"--no-tags",
			target.remote,
			`+refs/heads/${target.branch}:refs/remotes/${target.remote}/${target.branch}`,
		]),
	cachedBase?: CachedBase,
): Promise<ResolvedRef> {
	const branch = baseBranch?.trim() || (await resolveDefaultBranchName(git));
	if (branch.startsWith("refs/heads/")) {
		const commit = await commitAt(git, branch);
		if (!commit) throw new Error(`Local base branch does not exist: ${branch}`);
		return {
			kind: "local",
			fullRef: asLocalRef(branch.slice(11)),
			shortName: branch.slice(11),
			commit,
		};
	}
	const remotes = (await git.raw(["remote"]))
		.trim()
		.split("\n")
		.filter(Boolean);
	const qualified = branch.replace(/^refs\/remotes\//, "");
	const remote = remotes.find((name) => qualified.startsWith(`${name}/`));
	let target: BaseRefFetchTarget | null = remote
		? { remote, branch: qualified.slice(remote.length + 1) }
		: null;
	if (!target) {
		const local = await commitAt(git, asLocalRef(branch));
		const upstream = local ? await resolveUpstream(git, branch) : null;
		if (upstream)
			target = { remote: upstream.remote, branch: upstream.remoteBranch };
		else if ((!baseBranch || !local) && remotes.includes("origin"))
			target = { remote: "origin", branch };
		else if (local)
			return {
				kind: "local",
				fullRef: asLocalRef(branch),
				shortName: branch,
				commit: local,
			};
		else if (!baseBranch && remotes.length === 0) return { kind: "head" };
		else throw new Error(`Base branch does not exist: ${branch}`);
	}
	const fullRef = asRemoteRef(target.remote, target.branch);
	const ref = `${target.remote}/${target.branch}`;
	let commit: string | null;
	if (cachedBase) {
		commit = await commitAt(git, fullRef);
		if (cachedBase.ref !== ref || commit !== cachedBase.commit)
			throw new Error(
				"The cached base changed. Retry to review the current base.",
			);
	} else {
		try {
			await fetchRemoteRef(target);
			commit = await commitAt(git, fullRef);
			if (!commit) throw new Error("Fetched base could not be resolved");
		} catch (cause) {
			const cachedCommit = await commitAt(git, fullRef);
			const seconds = cachedCommit
				? await git
						.raw(["show", "-s", "--format=%ct", cachedCommit])
						.then(Number)
						.catch(() => NaN)
				: NaN;
			throw new BaseRefreshError(
				ref,
				cachedCommit,
				Number.isFinite(seconds) ? seconds * 1000 : null,
				cause,
			);
		}
	}
	return {
		kind: "remote-tracking",
		fullRef,
		shortName: target.branch,
		remote: target.remote,
		remoteShortName: ref,
		commit: commit ?? undefined,
	};
}
