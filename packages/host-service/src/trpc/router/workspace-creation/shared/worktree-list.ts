import { realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { GitClient } from "./types";

// Single source of truth for parsing `git worktree list --porcelain`.
// Every consumer in this package MUST go through `parseWorktreeList` /
// `listGitWorktrees` instead of re-parsing the porcelain output inline.
// Inline parsers drift apart silently — that is exactly how the
// "missing worktrees" bug crept in: one parser gated by managed-root
// prefix, another by realpath, and they disagreed.

export type WorktreeRecord = {
	// Path as git reports it (already realpath-canonicalized by git).
	path: string;
	// HEAD sha, or null for a bare worktree.
	head: string | null;
	// Branch short name (without `refs/heads/`), or null when detached or bare.
	branch: string | null;
	detached: boolean;
	bare: boolean;
	// `locked` and `prunable` carry a reason string when present (possibly
	// empty), or null when the flag isn't set on this worktree.
	locked: { reason: string } | null;
	prunable: { reason: string } | null;
};

export function parseWorktreeList(raw: string): WorktreeRecord[] {
	const records: WorktreeRecord[] = [];
	let current: WorktreeRecord | null = null;
	const flush = () => {
		if (current) {
			records.push(current);
			current = null;
		}
	};
	for (const line of raw.split("\n")) {
		if (line.startsWith("worktree ")) {
			flush();
			current = {
				path: line.slice("worktree ".length).trim(),
				head: null,
				branch: null,
				detached: false,
				bare: false,
				locked: null,
				prunable: null,
			};
		} else if (!current) {
			// Stray line before the first `worktree` block — ignore.
		} else if (line.startsWith("HEAD ")) {
			current.head = line.slice("HEAD ".length).trim() || null;
		} else if (line.startsWith("branch ")) {
			const ref = line.slice("branch ".length).trim();
			current.branch = ref.startsWith("refs/heads/")
				? ref.slice("refs/heads/".length)
				: ref;
		} else if (line === "detached") {
			current.detached = true;
		} else if (line === "bare") {
			current.bare = true;
		} else if (line === "locked" || line.startsWith("locked ")) {
			current.locked = { reason: line.slice("locked".length).trim() };
		} else if (line === "prunable" || line.startsWith("prunable ")) {
			current.prunable = { reason: line.slice("prunable".length).trim() };
		} else if (line === "") {
			flush();
		}
	}
	flush();
	return records;
}

export async function listGitWorktrees(
	git: GitClient,
): Promise<WorktreeRecord[]> {
	try {
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		return parseWorktreeList(raw);
	} catch (err) {
		console.warn("[workspace-creation] git worktree list failed:", err);
		return [];
	}
}

// Resolves a filesystem path through realpath when possible. Used to
// compare paths from git (which it canonicalizes) against caller-supplied
// paths (which may still contain symlinks like macOS `/var` → `/private/var`).
export function normalizeWorktreePath(path: string): string {
	try {
		return realpathSync.native(path);
	} catch {
		return resolvePath(path);
	}
}
