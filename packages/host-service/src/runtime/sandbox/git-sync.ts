/**
 * Bringing sandbox-local git history back to the host.
 *
 * In-container commits land only in the workspace's isolated git dir. Two
 * host-side operations recover them:
 *
 * - exportSandboxRefs: fetch every sandbox branch into the MAIN repo as
 *   `refs/sandbox/<workspaceId>/<branch>` (refs + objects only — nothing is
 *   checked out). Runs before sandbox destroy so commits are never lost.
 * - syncSandboxCommits: export, then fast-forward the workspace's real
 *   branch when host history hasn't diverged; otherwise report divergence
 *   and leave the exported ref for a manual merge.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { getWorkspaceSandboxPaths } from "./paths.ts";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 2 * 60_000;

async function git(cwd: string, args: string[]): Promise<string> {
	const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
		timeout: GIT_TIMEOUT_MS,
		maxBuffer: 16 * 1024 * 1024,
	});
	return stdout;
}

export function sandboxRefPrefix(workspaceId: string): string {
	return `refs/sandbox/${workspaceId}`;
}

export interface ExportResult {
	exported: boolean;
	refPrefix: string;
}

/**
 * Fetch all sandbox branches into the main repo under
 * refs/sandbox/<workspaceId>/. Idempotent; no-op when the workspace has no
 * sandbox git dir. `+` refspec: the sandbox dir is authoritative for its
 * own namespace, so re-exports always win.
 */
export async function exportSandboxRefs(args: {
	repoPath: string;
	workspaceId: string;
}): Promise<ExportResult> {
	const refPrefix = sandboxRefPrefix(args.workspaceId);
	const { gitDir } = getWorkspaceSandboxPaths(args.workspaceId);
	if (!existsSync(join(gitDir, "HEAD"))) {
		return { exported: false, refPrefix };
	}
	await git(args.repoPath, [
		"fetch",
		"--no-write-fetch-head",
		gitDir,
		`+refs/heads/*:${refPrefix}/*`,
	]);
	return { exported: true, refPrefix };
}

export type SyncSandboxResult =
	| { status: "no-sandbox-history" }
	| { status: "up-to-date"; ref: string }
	| { status: "fast-forwarded"; ref: string; sha: string }
	| { status: "diverged"; ref: string };

/**
 * Export sandbox refs, then fast-forward the workspace branch when safe:
 * clean worktree and host HEAD an ancestor of the sandbox branch. On
 * divergence the exported ref is left for a normal host-side merge/rebase.
 */
export async function syncSandboxCommits(args: {
	repoPath: string;
	worktreePath: string;
	workspaceId: string;
	branch: string;
}): Promise<SyncSandboxResult> {
	const { exported, refPrefix } = await exportSandboxRefs(args);
	if (!exported) return { status: "no-sandbox-history" };
	const ref = `${refPrefix}/${args.branch}`;

	let sandboxSha: string;
	try {
		sandboxSha = (
			await git(args.worktreePath, ["rev-parse", "--verify", `${ref}^{commit}`])
		).trim();
	} catch {
		// The sandbox never committed on this branch.
		return { status: "no-sandbox-history" };
	}

	// `reset --mixed` moves whatever branch is checked out. Guard against the
	// worktree having switched away from args.branch (manual checkout, detached
	// HEAD) so we never advance the wrong branch to the sandbox commit.
	const checkedOutBranch = (
		await git(args.worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"])
	).trim();
	if (checkedOutBranch !== args.branch) {
		return { status: "diverged", ref };
	}

	const headSha = (await git(args.worktreePath, ["rev-parse", "HEAD"])).trim();
	if (headSha === sandboxSha) return { status: "up-to-date", ref };

	try {
		await git(args.worktreePath, ["merge-base", "--is-ancestor", "HEAD", ref]);
	} catch {
		return { status: "diverged", ref };
	}

	// Forward move only (ancestor-checked). `reset --mixed` advances the
	// branch ref + index but never touches working files — the shared bind
	// mount already holds the content the sandbox committed, and any extra
	// uncommitted host edits simply remain visible as local modifications.
	// (`merge --ff-only` is unusable here: the host index is always stale
	// relative to in-sandbox commits, so git would refuse the checkout.)
	await git(args.worktreePath, ["reset", "--mixed", sandboxSha]);
	return { status: "fast-forwarded", ref, sha: sandboxSha };
}
