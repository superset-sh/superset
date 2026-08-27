/**
 * Isolated git metadata for sandboxed workspaces.
 *
 * The main repo's .git is never mounted into a sandbox. Instead each
 * workspace gets a host-side git dir (bind-mounted at CONTAINER_GIT_DIR)
 * bootstrapped from the repo, laid out exactly like `--separate-git-dir`:
 * the worktree's real `.git` pointer file is masked in-container by a
 * read-only one-line file pointing at CONTAINER_GIT_DIR, so git inside the
 * sandbox resolves the isolated metadata from any subdirectory with no env
 * vars. In-container commits stay sandbox-local until explicitly synced.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { CONTAINER_GIT_DIR, getWorkspaceSandboxPaths } from "./paths.ts";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 5 * 60_000;

export interface GitBootstrapParams {
	workspaceId: string;
	repoPath: string;
	branch: string;
	worktreePath: string;
	cloneDepth?: number;
}

export interface GitCommand {
	argv: string[];
	env?: Record<string, string>;
}

/**
 * The git command sequence that produces the sandbox git dir. Pure so tests
 * can assert the plan without running git. `headSha` is the worktree's
 * current HEAD — the shared repo's ref for the branch may lag behind it.
 */
export function buildGitBootstrapCommands(
	params: GitBootstrapParams & { headSha: string; gitDir: string },
): GitCommand[] {
	const { repoPath, branch, worktreePath, cloneDepth, headSha, gitDir } =
		params;
	return [
		{
			// file:// forces a real object copy — a hardlink/alternates clone
			// would dangle inside the container where the main repo .git is
			// not mounted.
			argv: [
				"clone",
				"--bare",
				"--single-branch",
				"--branch",
				branch,
				...(cloneDepth ? ["--depth", String(cloneDepth)] : []),
				`file://${repoPath}`,
				gitDir,
			],
		},
		{ argv: ["--git-dir", gitDir, "config", "core.bare", "false"] },
		{ argv: ["--git-dir", gitDir, "config", "core.worktree", worktreePath] },
		{ argv: ["--git-dir", gitDir, "config", "core.logAllRefUpdates", "true"] },
		{
			argv: [
				"--git-dir",
				gitDir,
				"update-ref",
				`refs/heads/${branch}`,
				headSha,
			],
		},
		{
			argv: [
				"--git-dir",
				gitDir,
				"symbolic-ref",
				"HEAD",
				`refs/heads/${branch}`,
			],
		},
		{
			// Seed the index to HEAD so the first in-container `git status`
			// reports clean instead of everything-deleted.
			argv: ["read-tree", "HEAD"],
			env: { GIT_DIR: gitDir, GIT_WORK_TREE: worktreePath },
		},
	];
}

async function git(command: GitCommand, cwd: string): Promise<void> {
	await execFileAsync("git", command.argv, {
		cwd,
		timeout: GIT_TIMEOUT_MS,
		maxBuffer: 16 * 1024 * 1024,
		env: { ...process.env, ...command.env },
	});
}

/**
 * Idempotently create the sandbox git dir + .git mask for a workspace.
 * Skips everything when the git dir already exists (container recreation,
 * host-service restarts). Errors propagate — the caller surfaces them as
 * terminal-create failures.
 */
export async function ensureSandboxGit(
	params: GitBootstrapParams,
): Promise<void> {
	const paths = getWorkspaceSandboxPaths(params.workspaceId);
	// The bootstrap-sha file is the LAST artifact written, so it is the only
	// safe "done" sentinel: keying off gitDir/HEAD would treat a run
	// interrupted after the bare clone but before the .git mask as complete,
	// leaving the isolation mask absent. Anything short of the sentinel is a
	// partial state — wipe and rebuild it atomically.
	if (existsSync(paths.bootstrapShaFile)) return;
	if (existsSync(paths.gitDir) || existsSync(paths.dotGitFile)) {
		await rm(paths.gitDir, { recursive: true, force: true });
		await rm(paths.dotGitFile, { force: true });
	}

	await mkdir(paths.stateDir, { recursive: true });

	const { stdout } = await execFileAsync(
		"git",
		["-C", params.worktreePath, "rev-parse", "HEAD"],
		{ timeout: 30_000 },
	);
	const headSha = stdout.trim();

	for (const command of buildGitBootstrapCommands({
		...params,
		headSha,
		gitDir: paths.gitDir,
	})) {
		await git(command, params.repoPath);
	}

	await writeFile(paths.dotGitFile, `gitdir: ${CONTAINER_GIT_DIR}\n`, {
		mode: 0o444,
	});
	// Written last: its presence marks the bootstrap complete (see above).
	await writeFile(paths.bootstrapShaFile, `${headSha}\n`, { mode: 0o644 });
}
