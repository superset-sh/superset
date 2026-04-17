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
		await git.raw(["rev-parse", "--verify", "--quiet", `${fullRef}^{commit}`]);
		return true;
	} catch {
		return false;
	}
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

	// Local always wins: if a local branch literally named `<input>` exists
	// (including names like `origin/foo`), it takes precedence. Probes against
	// the full refname so the structural prefix removes any ambiguity.
	const localRef = asLocalRef(trimmed);
	if (await refExists(git, localRef)) {
		return { kind: "local", fullRef: localRef, shortName: trimmed };
	}

	// For the remote probe, accept both bare names (`foo`) and the natural
	// short form (`origin/foo`). Strip the `<remote>/` prefix only if it's
	// present in the input — without this, `origin/foo` would probe
	// `refs/remotes/origin/origin/foo` and miss.
	const remotePrefix = `${remote}/`;
	const remoteShortName = trimmed.startsWith(remotePrefix)
		? trimmed.slice(remotePrefix.length)
		: trimmed;
	const remoteRef = asRemoteRef(remote, remoteShortName);
	if (await refExists(git, remoteRef)) {
		return {
			kind: "remote-tracking",
			fullRef: remoteRef,
			shortName: remoteShortName,
			remote,
			remoteShortName: `${remote}/${remoteShortName}`,
		};
	}

	const tagRef: `refs/tags/${string}` = `refs/tags/${trimmed}`;
	if (await refExists(git, tagRef)) {
		return { kind: "tag", fullRef: tagRef, shortName: trimmed };
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
