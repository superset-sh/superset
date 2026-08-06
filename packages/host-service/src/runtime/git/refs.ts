import type { SimpleGit } from "simple-git";

/**
 * A git ref resolved against the local repo, classified by type at the
 * boundary so downstream code never has to infer kind from a string.
 *
 * See `packages/host-service/GIT_REFS.md` for the rationale.
 */
export type ResolvedRef =
	| {
			kind: "local";
			fullRef: `refs/heads/${string}`;
			shortName: string;
	  }
	| {
			kind: "remote-tracking";
			fullRef: `refs/remotes/${string}/${string}`;
			shortName: string;
			remote: string;
			remoteShortName: string;
	  }
	| {
			kind: "tag";
			fullRef: `refs/tags/${string}`;
			shortName: string;
	  }
	| { kind: "head" };

/** Wrap a branch name as a fully-qualified local ref. */
export function asLocalRef(name: string): `refs/heads/${string}` {
	return `refs/heads/${name}`;
}

/** Wrap a branch name as a fully-qualified remote-tracking ref. */
export function asRemoteRef(
	remote: string,
	name: string,
): `refs/remotes/${string}/${string}` {
	return `refs/remotes/${remote}/${name}`;
}

export async function refExists(
	git: SimpleGit,
	fullRef: string,
): Promise<boolean> {
	try {
		// Don't use `--quiet` — simple-git's `raw` mis-resolves on empty
		// stderr and reports the missing ref as a success with empty stdout.
		// Without `--quiet`, git writes the error to stderr and simple-git
		// rejects as expected. We then verify a sha was actually printed.
		const out = await git.raw(["rev-parse", "--verify", `${fullRef}^{commit}`]);
		return /^[0-9a-f]{40,}/.test(out.trim());
	} catch {
		return false;
	}
}

/**
 * Enumerate branch refnames as git stores them. Used instead of `rev-parse`
 * probes because on a case-insensitive filesystem (macOS default) probing
 * `refs/heads/foo` resolves the `refs/heads/Foo` file, hiding case drift.
 */
async function listBranchShortNames(
	git: SimpleGit,
	remote: string,
): Promise<{ local: string[]; remoteTracking: string[] }> {
	const local: string[] = [];
	const remoteTracking: string[] = [];
	let raw: string;
	try {
		// A real git failure must not be masked as "no branches" — that hides an
		// existing branch and lets a case-twin be created. (An empty repo isn't
		// a failure: for-each-ref exits 0 with no output.)
		raw = await git.raw([
			"for-each-ref",
			"--format=%(refname)",
			"refs/heads/",
			`refs/remotes/${remote}/`,
		]);
	} catch (error) {
		console.warn("[host-service:git] for-each-ref failed in resolveRef", {
			remote,
			error,
		});
		throw error;
	}
	const remotePrefix = `refs/remotes/${remote}/`;
	for (const refname of raw.trim().split("\n").filter(Boolean)) {
		if (refname.startsWith("refs/heads/")) {
			local.push(refname.slice("refs/heads/".length));
		} else if (refname.startsWith(remotePrefix)) {
			const name = refname.slice(remotePrefix.length);
			if (name !== "HEAD") remoteTracking.push(name);
		}
	}
	return { local, remoteTracking };
}

function findCaseInsensitiveMatch(
	names: string[],
	input: string,
): string | null {
	const lower = input.toLowerCase();
	return names.find((name) => name.toLowerCase() === lower) ?? null;
}

export interface ResolveRefOptions {
	/**
	 * Remote name to probe for remote-tracking refs. Defaults to "origin".
	 * Multi-remote support: pass an explicit remote, or extend `resolveRef`
	 * to enumerate `git remote` and probe each.
	 */
	remote?: string;
	/** Whether to fall back to `HEAD` when nothing matches. Defaults to false. */
	headFallback?: boolean;
}

/**
 * Resolve a user-supplied ref string to a `ResolvedRef`. Probes happen
 * against full refnames so the classification is unambiguous.
 *
 * Accepted input shapes:
 *   - bare branch name           (`foo`)
 *   - remote-qualified shortname (`origin/foo`)
 *   - tag name                   (`v1.0`)
 *
 * Resolution order — local always wins, so a local branch literally named
 * `origin/foo` resolves to `kind: "local"`, not `remote-tracking`:
 *
 *   1. local branch (`refs/heads/<input>`)
 *   2. remote-tracking (`refs/remotes/<remote>/<input>`, after stripping
 *      a leading `<remote>/` from the input if present)
 *   3. tag (`refs/tags/<input>`)
 *   4. HEAD fallback (only if `headFallback: true`)
 *
 * Returns `null` if nothing matches and `headFallback` is false.
 */
export async function resolveRef(
	git: SimpleGit,
	input: string,
	options: ResolveRefOptions = {},
): Promise<ResolvedRef | null> {
	const remote = options.remote ?? "origin";
	const trimmed = input.trim();
	if (!trimmed) {
		return options.headFallback ? { kind: "head" } : null;
	}

	// Match against enumerated refnames so casing is authoritative. Exact
	// matches keep precedence (local > remote-tracking); a case-insensitive
	// match is a fallback tier that adopts the existing branch's canonical
	// casing rather than minting a case-twin sharing its loose-ref file.
	const branches = await listBranchShortNames(git, remote);

	// For the remote form, accept both bare names (`foo`) and the natural
	// short form (`origin/foo`). Strip the `<remote>/` prefix only if it's
	// present in the input — without this, `origin/foo` would look up
	// `refs/remotes/origin/origin/foo` and miss.
	const remotePrefix = `${remote}/`;
	const remoteShortName = trimmed.startsWith(remotePrefix)
		? trimmed.slice(remotePrefix.length)
		: trimmed;

	const asLocal = (name: string): ResolvedRef => ({
		kind: "local",
		fullRef: asLocalRef(name),
		shortName: name,
	});
	const asRemoteTracking = (name: string): ResolvedRef => ({
		kind: "remote-tracking",
		fullRef: asRemoteRef(remote, name),
		shortName: name,
		remote,
		remoteShortName: `${remote}/${name}`,
	});

	if (branches.local.includes(trimmed)) {
		return asLocal(trimmed);
	}

	if (branches.remoteTracking.includes(remoteShortName)) {
		return asRemoteTracking(remoteShortName);
	}

	const tagRef: `refs/tags/${string}` = `refs/tags/${trimmed}`;
	if (await refExists(git, tagRef)) {
		return { kind: "tag", fullRef: tagRef, shortName: trimmed };
	}

	const localTwin = findCaseInsensitiveMatch(branches.local, trimmed);
	if (localTwin) {
		return asLocal(localTwin);
	}

	const remoteTwin = findCaseInsensitiveMatch(
		branches.remoteTracking,
		remoteShortName,
	);
	if (remoteTwin) {
		return asRemoteTracking(remoteTwin);
	}

	return options.headFallback ? { kind: "head" } : null;
}

// Reached only when `origin/HEAD` cannot answer. The remote is the
// authoritative source, and `git remote set-head origin --auto` is what asks
// it; the branch picker runs that whenever it has the network.
const DEFAULT_BRANCH_CANDIDATES = ["main", "master", "develop", "trunk"];

/**
 * The branch `origin/HEAD` names, or null when unset or stale.
 *
 * Git writes `origin/HEAD` at clone time and never refreshes it on fetch, so
 * it outlives an upstream rename and even the branch being deleted. Trust it
 * only while the branch it names still resolves.
 *
 * That check is local, so it can only catch a stale symref once the branch it
 * names is gone from `refs/remotes/`. A plain `git fetch` leaves the old
 * remote-tracking ref in place, so the symref still looks valid until a
 * `--prune`. `git remote set-head origin --auto` is what actually settles it,
 * and the branch picker runs both.
 */
export async function readOriginHeadBranch(
	git: SimpleGit,
): Promise<string | null> {
	let target: string;
	try {
		target = (
			await git.raw(["symbolic-ref", asRemoteRef("origin", "HEAD")])
		).trim();
	} catch {
		return null;
	}
	// Read the full refname, not `--short`: git will happily point this symref
	// at a local branch, and the short form of `refs/heads/foo` is bare `foo`,
	// indistinguishable from a real remote-tracking branch. See GIT_REFS.md.
	const prefix = asRemoteRef("origin", "");
	if (!target.startsWith(prefix)) return null;
	const branch = target.slice(prefix.length);
	if (!branch) return null;
	return (await refExists(git, asRemoteRef("origin", branch))) ? branch : null;
}

/**
 * Resolve the repo's default branch name (typically `main`). Falls back to the
 * first conventional name that exists — remote-tracking, then local — and then
 * to any branch at all, rather than naming one the repo may not have.
 *
 * Throws if the repo can't be enumerated: a repo we can't read is not a repo
 * with no branches, and inventing a name here puts new worktrees on a base
 * that doesn't exist.
 */
export async function resolveDefaultBranchName(
	git: SimpleGit,
): Promise<string> {
	const fromOriginHead = await readOriginHeadBranch(git);
	if (fromOriginHead) return fromOriginHead;

	const branches = await listBranchShortNames(git, "origin");
	for (const names of [branches.remoteTracking, branches.local]) {
		const candidate = DEFAULT_BRANCH_CANDIDATES.find((name) =>
			names.includes(name),
		);
		if (candidate) return candidate;
	}

	// Nothing conventional. The branch HEAD is on beats an alphabetical pick,
	// and both beat a made-up `main`; only an empty repo, which has no branch
	// to name, falls through to that.
	const head = await git
		.raw(["symbolic-ref", "--short", "HEAD"])
		.then((out) => out.trim())
		.catch(() => "");
	if (head && branches.local.includes(head)) return head;
	return branches.remoteTracking[0] ?? branches.local[0] ?? "main";
}

/**
 * Resolve a local branch's upstream tracking info (`branch.<name>.remote`
 * / `branch.<name>.merge`). Returns `null` if no upstream is configured.
 */
export async function resolveUpstream(
	git: SimpleGit,
	branch: string,
): Promise<{ remote: string; remoteBranch: string } | null> {
	try {
		const [remote, merge] = await Promise.all([
			git.raw(["config", "--get", `branch.${branch}.remote`]),
			git.raw(["config", "--get", `branch.${branch}.merge`]),
		]);
		const remoteBranch = merge.trim().replace(/^refs\/heads\//, "");
		const remoteName = remote.trim();
		if (!remoteName || !remoteBranch) return null;
		return { remote: remoteName, remoteBranch };
	} catch {
		return null;
	}
}
