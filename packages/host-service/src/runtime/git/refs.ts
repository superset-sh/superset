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

async function refExists(git: SimpleGit, fullRef: string): Promise<boolean> {
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

/**
 * Resolve the repo's default branch name (typically `main`) from
 * `origin/HEAD`. Falls back to `"main"` if symbolic-ref isn't set.
 */
export async function resolveDefaultBranchName(
	git: SimpleGit,
): Promise<string> {
	try {
		const ref = await git.raw([
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
			"--short",
		]);
		return ref.trim().replace(/^origin\//, "");
	} catch {
		return "main";
	}
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
