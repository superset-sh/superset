// Pure parsers and classifiers for git.listGraph. No git, no DB, no tRPC —
// everything here operates on raw git stdout strings and is unit-testable.
// The worker task (workers/tasks/git.ts) spawns git and feeds stdout here; the
// tRPC coordinator (git.ts listGraph) joins the worker's structured output
// against DB workspace rows to compute ref state.

import type { WorktreeRecord } from "../../workspace-creation/shared/worktree-list";
import type { GraphRefScope, GraphRefType } from "../types";

/** Commit as parsed from `git log` (no refs attached yet). */
export interface RawGraphCommit {
	hash: string;
	shortHash: string;
	parents: string[];
	author: string;
	authorEmail: string;
	date: string;
	message: string;
}

/** A ref resolved to its target sha, classified by type. The decoration map
 * is built from these; the coordinator attaches per-commit and adds state. */
export interface GraphRefRecord {
	sha: string;
	name: string;
	type: GraphRefType;
	/** Fully-qualified refname (e.g. `refs/heads/main`), or "HEAD". */
	fullRef: string;
}

/** Raw `for-each-ref` row including the upstream column. */
export interface ParsedRef extends GraphRefRecord {
	/** Upstream ref (`refs/remotes/<remote>/<branch>`) for local branches, or "". */
	upstream: string;
}

/** Output of the git graph worker task. The coordinator post-processes this. */
export interface GraphLogTaskOutput {
	commits: RawGraphCommit[];
	refs: GraphRefRecord[];
	worktrees: WorktreeRecord[];
	/** Full refnames (`refs/heads/<name>`) contained in the base ref. */
	mergedBranches: string[];
	totalCommits: number | null;
}

/** Classify a full refname into a graph ref type, or null if unrecognized. */
export function classifyRefType(fullRef: string): GraphRefType | null {
	if (fullRef === "HEAD") return "head";
	if (fullRef.startsWith("refs/heads/")) return "branch";
	if (fullRef.startsWith("refs/tags/")) return "tag";
	if (fullRef.startsWith("refs/remotes/")) return "remote";
	return null;
}

/** Short display name from a full refname. */
export function refShortName(fullRef: string): string {
	if (fullRef.startsWith("refs/heads/"))
		return fullRef.slice("refs/heads/".length);
	if (fullRef.startsWith("refs/tags/"))
		return fullRef.slice("refs/tags/".length);
	if (fullRef.startsWith("refs/remotes/")) {
		return fullRef.slice("refs/remotes/".length);
	}
	return fullRef;
}

/**
 * Parse `git for-each-ref --format=%(objectname)%x09%(refname)%x09%(upstream)`
 * across refs/heads/, refs/remotes/, refs/tags/. Drops the symbolic remote
 * HEAD refs (`refs/remotes/<remote>/HEAD`) so the default branch isn't
 * double-decorated.
 */
export function parseForEachRef(raw: string): ParsedRef[] {
	const records: ParsedRef[] = [];
	for (const line of raw.split("\n")) {
		if (!line) continue;
		const cols = line.split("\t");
		const sha = cols[0];
		const fullRef = cols[1] ?? "";
		const upstream = cols[2] ?? "";
		if (!sha || !fullRef) continue;
		const type = classifyRefType(fullRef);
		if (!type) continue;
		if (
			type === "remote" &&
			fullRef.startsWith("refs/remotes/") &&
			fullRef.endsWith("/HEAD")
		) {
			continue;
		}
		records.push({
			sha,
			name: refShortName(fullRef),
			type,
			fullRef,
			upstream,
		});
	}
	return records;
}

/**
 * Parse `git log --format=%H%x09%h%x09%P%x09%an%x09%ae%x09%aI%x09%s`.
 * The subject is emitted LAST so a tab inside it cannot shift the structured
 * fields ahead of it; the first six tabs are authoritative and everything
 * after the sixth is re-joined as the subject (subjects may contain tabs).
 */
export function parseGraphLog(raw: string): RawGraphCommit[] {
	const commits: RawGraphCommit[] = [];
	for (const line of raw.split("\n")) {
		if (!line) continue;
		const parts = line.split("\t");
		if (parts.length < 7) continue;
		const [hash, shortHash, parentsRaw, author, authorEmail, date] = parts;
		const message = parts.slice(6).join("\t");
		commits.push({
			hash: hash ?? "",
			shortHash: shortHash ?? "",
			parents: (parentsRaw ?? "").split(" ").filter(Boolean),
			author: author ?? "",
			authorEmail: authorEmail ?? "",
			date: date ?? "",
			message,
		});
	}
	return commits;
}

/**
 * Parse `git branch --merged <baseRef> --format=%(refname)` into a set of full
 * local-branch refnames contained in the base ref.
 */
export function parseMergedBranches(raw: string): string[] {
	return raw
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.startsWith("refs/heads/"));
}

/**
 * Assemble the deduped list of git tips for a ref scope. All inputs are
 * assumed to exist (the worker validates before calling); duplicate strings
 * are collapsed and git log deduplicates reachability regardless.
 *
 * - `head`: HEAD alone — the checked-out branch's own history.
 * - `open-workspaces`: HEAD, base, detached worktree heads, and the branches
 *   actually checked out in a worktree.
 * - `local` (default): the above plus every local branch and the tracked
 *   upstream of the current branch. Tags and other remotes decorate only.
 * - `remote`: HEAD plus every `refs/remotes/*` — what the last fetch saw on
 *   the server, without local-only branches. Reflects fetch time, not origin
 *   right now; this never fetches.
 * - `all`: every ref, via git's own `--all` — a tag-heavy repo would otherwise
 *   put thousands of refnames on one command line.
 */
export function buildTipSet(args: {
	scope?: GraphRefScope;
	head: string;
	baseRef: string | null;
	localBranchRefs: string[];
	detachedWorktreeHeads: string[];
	upstreamRefs: string[];
	/** `refs/heads/…` checked out in some worktree. Tips under
	 *  `open-workspaces` only. */
	worktreeBranchRefs?: string[];
}): string[] {
	const scope = args.scope ?? "local";
	const tips = new Set<string>();
	tips.add(args.head);
	if (scope === "head") return [...tips];
	if (scope === "remote") {
		// One arg for every `refs/remotes/*`, same argument-count guard as `--all`.
		// Local branches and detached worktree heads stay out — that is the point
		// of the scope. HEAD stays so you can see where you sit against them.
		tips.add("--remotes");
		return [...tips];
	}
	if (args.baseRef) tips.add(args.baseRef);
	for (const s of args.detachedWorktreeHeads) tips.add(s);
	if (scope === "open-workspaces") {
		for (const r of args.worktreeBranchRefs ?? []) tips.add(r);
		return [...tips];
	}
	if (scope === "all") {
		// Argument-count guard: `--all` is one arg whatever the ref count. The
		// worktree heads above still have to be named — they are not refs.
		// `--exclude` must precede the `--all` it filters.
		tips.add("--exclude=refs/stash");
		tips.add("--all");
		return [...tips];
	}
	for (const r of args.localBranchRefs) tips.add(r);
	for (const u of args.upstreamRefs) tips.add(u);
	return [...tips];
}

/**
 * Build a branch-name → worktree map for the non-bare, branch-checked-out
 * worktrees. A branch can be checked out in at most one worktree (git
 * enforces this), so the mapping is 1:1.
 */
export function worktreeByBranch(
	worktrees: WorktreeRecord[],
): Map<string, WorktreeRecord> {
	const map = new Map<string, WorktreeRecord>();
	for (const w of worktrees) {
		if (w.bare || w.detached || !w.branch) continue;
		if (!map.has(w.branch)) map.set(w.branch, w);
	}
	return map;
}
