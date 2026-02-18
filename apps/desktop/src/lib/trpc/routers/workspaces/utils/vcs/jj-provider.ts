/**
 * JjProvider — implements VcsProvider using native Jujutsu (jj) commands.
 *
 * Designed for colocated repos (.jj + .git side by side).
 * Uses `jj` CLI for workspace lifecycle, status, and bookmark operations.
 */

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { getShellEnvironment } from "../shell-env";
import type {
	BranchExistsOnRemoteResult,
	ExternalWorkspace,
	VcsProvider,
} from "./types";

const execFileAsync = promisify(execFile);

/**
 * Get a merged environment with the user's shell PATH.
 * Same pattern as git.ts getGitEnv().
 */
async function getJjEnv(): Promise<Record<string, string>> {
	const shellEnv = await getShellEnvironment();
	const result: Record<string, string> = {};

	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") {
			result[key] = value;
		}
	}

	const pathKey = process.platform === "win32" ? "Path" : "PATH";
	if (shellEnv[pathKey]) {
		result[pathKey] = shellEnv[pathKey];
	}

	return result;
}

/**
 * Execute a jj command and return stdout.
 * Automatically adds --no-pager, --color=never, and -R for repo path.
 */
async function jj(
	repoPath: string,
	args: string[],
	timeout = 30_000,
): Promise<string> {
	const env = await getJjEnv();
	const { stdout } = await execFileAsync(
		"jj",
		["--no-pager", "--color=never", "-R", repoPath, ...args],
		{ env, timeout },
	);
	return stdout;
}

/**
 * Derive a jj workspace name from a workspace path.
 * jj workspace names must be simple identifiers. We use the directory basename.
 */
function workspaceNameFromPath(workspacePath: string): string {
	return basename(workspacePath);
}

/**
 * Parse `jj workspace list` output into workspace entries.
 * Default output format: "name: <commit_id> <description>"
 * Each line starts with the workspace name followed by a colon.
 */
async function parseWorkspaceList(
	repoPath: string,
): Promise<Array<{ name: string; path: string }>> {
	// Use template to get structured output: "name path\n"
	// The `self.name()` and `self.path()` aren't available on workspace list,
	// so we parse the porcelain output manually and cross-reference with `jj workspace root`
	const output = await jj(repoPath, ["workspace", "list"]);
	const workspaces: Array<{ name: string; path: string }> = [];

	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Format: "name: <change_id> <description>"
		const colonIdx = trimmed.indexOf(":");
		if (colonIdx > 0) {
			const name = trimmed.slice(0, colonIdx).trim();
			workspaces.push({ name, path: "" });
		}
	}

	// Resolve paths: the default workspace is at repo root, others are siblings
	// jj stores workspace paths internally. We use `jj workspace root` from each.
	// For now, use the convention that workspaces are created as siblings.
	const repoRoot = await jj(repoPath, ["root"]).then((s) => s.trim());

	for (const ws of workspaces) {
		if (ws.name === "default") {
			ws.path = repoRoot;
		} else {
			// Workspaces created by us are siblings of the main repo's parent
			ws.path = join(dirname(repoRoot), ws.name);
		}
	}

	return workspaces;
}

export class JjProvider implements VcsProvider {
	readonly type = "jj" as const;

	async createWorkspace(params: {
		mainRepoPath: string;
		branch: string;
		workspacePath: string;
		startPoint?: string;
	}): Promise<void> {
		const parentDir = dirname(params.workspacePath);
		await mkdir(parentDir, { recursive: true });

		const wsName = workspaceNameFromPath(params.workspacePath);
		const args = ["workspace", "add", params.workspacePath, "--name", wsName];

		if (params.startPoint) {
			// For jj, startPoint is a revset. Callers pass things like "origin/main"
			// which in jj should be "main@origin". However, jj also accepts bookmark
			// names directly and remote tracking refs, so we normalize.
			const jjRef = gitRefToJjRevset(params.startPoint);
			args.push("-r", jjRef);
		}

		await jj(params.mainRepoPath, args, 120_000);

		// Create a bookmark for the branch on the new workspace's working copy
		try {
			await jj(params.workspacePath, [
				"bookmark",
				"create",
				params.branch,
				"-r",
				"@",
			]);
		} catch (error) {
			// Bookmark may already exist if it was an existing branch name
			const msg = error instanceof Error ? error.message : String(error);
			if (!msg.includes("already exists")) {
				throw error;
			}
			// If it already exists, move it to point at @
			await jj(params.workspacePath, [
				"bookmark",
				"set",
				params.branch,
				"-r",
				"@",
			]);
		}
	}

	async createWorkspaceFromExistingBranch(params: {
		mainRepoPath: string;
		branch: string;
		workspacePath: string;
	}): Promise<void> {
		const parentDir = dirname(params.workspacePath);
		await mkdir(parentDir, { recursive: true });

		const wsName = workspaceNameFromPath(params.workspacePath);

		await jj(
			params.mainRepoPath,
			[
				"workspace",
				"add",
				params.workspacePath,
				"--name",
				wsName,
				"-r",
				params.branch,
			],
			120_000,
		);
	}

	async removeWorkspace(
		mainRepoPath: string,
		workspacePath: string,
	): Promise<void> {
		try {
			const wsName = workspaceNameFromPath(workspacePath);

			// Forget the workspace in jj first
			try {
				await jj(mainRepoPath, ["workspace", "forget", wsName]);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				// If workspace wasn't registered in jj, try git worktree prune
				// (handles legacy git worktrees in jj repos)
				if (msg.includes("not found") || msg.includes("No such workspace")) {
					console.warn(
						`[jj-provider] Workspace "${wsName}" not found in jj, may be a git worktree`,
					);
					const env = await getJjEnv();
					try {
						await execFileAsync(
							"git",
							["-C", mainRepoPath, "worktree", "prune"],
							{ env, timeout: 10_000 },
						);
					} catch {}
				} else {
					throw error;
				}
			}

			// Rename + async delete (same pattern as git removeWorktree)
			const tempPath = join(
				dirname(workspacePath),
				`.superset-delete-${randomUUID()}`,
			);
			await rename(workspacePath, tempPath);

			const child = spawn("/bin/rm", ["-rf", tempPath], {
				detached: true,
				stdio: "ignore",
			});
			child.unref();
			child.on("error", (err) => {
				console.error(
					`[jj-provider] Failed to spawn rm for ${tempPath}:`,
					err.message,
				);
			});
			child.on("exit", (code: number | null) => {
				if (code !== 0) {
					console.error(
						`[jj-provider] Background cleanup of ${tempPath} failed (exit ${code})`,
					);
				}
			});
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT") {
				// Directory already gone, just forget the workspace
				try {
					const wsName = workspaceNameFromPath(workspacePath);
					await jj(mainRepoPath, ["workspace", "forget", wsName]);
				} catch {}
				return;
			}
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`[jj-provider] Failed to remove workspace: ${errorMessage}`,
			);
			throw new Error(`Failed to remove workspace: ${errorMessage}`);
		}
	}

	async workspaceExists(
		mainRepoPath: string,
		workspacePath: string,
	): Promise<boolean> {
		try {
			const workspaces = await parseWorkspaceList(mainRepoPath);
			const wsName = workspaceNameFromPath(workspacePath);
			return workspaces.some((ws) => ws.name === wsName);
		} catch {
			return false;
		}
	}

	async listExternalWorkspaces(
		mainRepoPath: string,
	): Promise<ExternalWorkspace[]> {
		try {
			const workspaces = await parseWorkspaceList(mainRepoPath);
			const result: ExternalWorkspace[] = [];

			for (const ws of workspaces) {
				if (ws.name === "default") continue; // Skip the main workspace

				// Get the bookmark on the workspace's working copy
				let branch: string | null = null;
				try {
					const bookmarkOutput = await jj(mainRepoPath, [
						"log",
						"-r",
						`${ws.name}@`,
						"--no-graph",
						"-T",
						'bookmarks ++ "\\n"',
					]);
					const firstLine = bookmarkOutput.trim().split("\n")[0]?.trim();
					if (firstLine) {
						// bookmarks template may return "name name2", take the first
						branch = firstLine.split(/\s+/)[0] || null;
					}
				} catch {
					// Workspace may not be accessible
				}

				result.push({
					path: ws.path,
					branch,
					isDetached: branch === null,
					isBare: false,
				});
			}

			return result;
		} catch (error) {
			console.error(
				`[jj-provider] Failed to list external workspaces: ${error}`,
			);
			throw error;
		}
	}

	async getBranchWorkspacePath(params: {
		mainRepoPath: string;
		branch: string;
	}): Promise<string | null> {
		try {
			const workspaces = await parseWorkspaceList(params.mainRepoPath);

			for (const ws of workspaces) {
				try {
					const bookmarkOutput = await jj(params.mainRepoPath, [
						"log",
						"-r",
						`${ws.name}@`,
						"--no-graph",
						"-T",
						"bookmarks",
					]);
					const bookmarks = bookmarkOutput.trim().split(/\s+/);
					if (bookmarks.includes(params.branch)) {
						return ws.path;
					}
				} catch {}
			}

			return null;
		} catch {
			return null;
		}
	}

	async hasUncommittedChanges(workspacePath: string): Promise<boolean> {
		try {
			const output = await jj(workspacePath, ["diff", "--stat"]);
			return output.trim().length > 0;
		} catch {
			return false;
		}
	}

	async hasUnpushedCommits(workspacePath: string): Promise<boolean> {
		try {
			// Find local bookmarks that have commits not on their remote tracking branch
			const output = await jj(workspacePath, [
				"log",
				"-r",
				"bookmarks() & mine() ~ remote_bookmarks()",
				"--no-graph",
				"-T",
				'change_id ++ "\\n"',
			]);
			return output.trim().length > 0;
		} catch {
			return false;
		}
	}

	async getAheadBehindCount(params: {
		repoPath: string;
		defaultBranch: string;
	}): Promise<{ ahead: number; behind: number }> {
		try {
			// Ahead: commits reachable from @ but not from trunk
			const aheadOutput = await jj(params.repoPath, [
				"log",
				"-r",
				`::@ ~ ::${params.defaultBranch}`,
				"--no-graph",
				"-T",
				'change_id ++ "\\n"',
			]);
			const aheadLines = aheadOutput
				.trim()
				.split("\n")
				.filter((l) => l.trim().length > 0);

			// Behind: commits reachable from trunk but not from @
			const behindOutput = await jj(params.repoPath, [
				"log",
				"-r",
				`::${params.defaultBranch} ~ ::@`,
				"--no-graph",
				"-T",
				'change_id ++ "\\n"',
			]);
			const behindLines = behindOutput
				.trim()
				.split("\n")
				.filter((l) => l.trim().length > 0);

			return { ahead: aheadLines.length, behind: behindLines.length };
		} catch {
			return { ahead: 0, behind: 0 };
		}
	}

	async getCurrentBranch(repoPath: string): Promise<string | null> {
		try {
			// Get bookmarks on the working copy commit
			const output = await jj(repoPath, [
				"log",
				"-r",
				"@",
				"--no-graph",
				"-T",
				"bookmarks",
			]);
			const trimmed = output.trim();
			if (!trimmed) return null;

			// May return multiple bookmarks separated by spaces; take the first
			const first = trimmed.split(/\s+/)[0];
			// jj may append '*' to indicate the bookmark has been modified
			return first?.replace(/\*$/, "") || null;
		} catch {
			return null;
		}
	}

	async listBranches(
		repoPath: string,
		options?: { fetch?: boolean },
	): Promise<{ local: string[]; remote: string[] }> {
		if (options?.fetch) {
			try {
				await jj(repoPath, ["git", "fetch"], 60_000);
			} catch (error) {
				console.warn("[jj-provider] git fetch failed:", error);
			}
		}

		try {
			const output = await jj(repoPath, ["bookmark", "list", "--all-remotes"]);

			const local: string[] = [];
			const remote: string[] = [];

			for (const line of output.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;

				// jj bookmark list output:
				// "name: <change_id> <description>"
				// "name@origin: <change_id> <description>"
				const colonIdx = trimmed.indexOf(":");
				if (colonIdx <= 0) continue;

				const namepart = trimmed.slice(0, colonIdx).trim();
				if (namepart.includes("@")) {
					// Remote bookmark: "name@remote"
					const [bookmarkName] = namepart.split("@");
					if (bookmarkName && !remote.includes(bookmarkName)) {
						remote.push(bookmarkName);
					}
				} else {
					if (!local.includes(namepart)) {
						local.push(namepart);
					}
				}
			}

			return { local, remote };
		} catch (error) {
			console.error("[jj-provider] Failed to list bookmarks:", error);
			return { local: [], remote: [] };
		}
	}

	async getDefaultBranch(mainRepoPath: string): Promise<string> {
		try {
			// Try to get the trunk() alias from jj config
			const output = await jj(mainRepoPath, [
				"config",
				"get",
				"revset-aliases.trunk()",
			]);
			const trimmed = output.trim();
			if (trimmed) {
				// The config value is a revset like "main@origin" or just "main"
				// Extract the bookmark name (part before @)
				const bookmarkName = trimmed.split("@")[0];
				if (bookmarkName) return bookmarkName;
			}
		} catch {
			// Config not set, fall back to checking common branch names
		}

		// Check for common default branch names
		const { local } = await this.listBranches(mainRepoPath);
		for (const name of ["main", "master", "develop", "trunk"]) {
			if (local.includes(name)) return name;
		}

		return "main";
	}

	async refreshDefaultBranch(mainRepoPath: string): Promise<string | null> {
		try {
			await jj(mainRepoPath, ["git", "fetch"], 60_000);
			const defaultBranch = await this.getDefaultBranch(mainRepoPath);
			return defaultBranch;
		} catch {
			return null;
		}
	}

	async fetchDefaultBranch(
		mainRepoPath: string,
		defaultBranch: string,
	): Promise<string> {
		await jj(mainRepoPath, ["git", "fetch", "-b", defaultBranch], 60_000);

		// Return the commit hash of the fetched branch
		try {
			const output = await jj(mainRepoPath, [
				"log",
				"-r",
				defaultBranch,
				"--no-graph",
				"-T",
				"commit_id",
			]);
			return output.trim();
		} catch {
			return "";
		}
	}

	async deleteLocalBranch(params: {
		mainRepoPath: string;
		branch: string;
	}): Promise<void> {
		// `jj bookmark forget` removes the bookmark locally without
		// propagating deletion to remote on next push (unlike `bookmark delete`)
		await jj(params.mainRepoPath, ["bookmark", "forget", params.branch]);
	}

	async checkoutBranch(repoPath: string, branch: string): Promise<void> {
		// `jj edit` moves the working copy to an existing change
		await jj(repoPath, ["edit", branch]);
	}

	async safeCheckoutBranch(repoPath: string, branch: string): Promise<void> {
		// jj doesn't have the same "dirty working copy" problem as git
		// since the working copy IS always a commit. Just edit the target.
		await jj(repoPath, ["edit", branch]);
	}

	async refExistsLocally(repoPath: string, ref: string): Promise<boolean> {
		try {
			// Normalize git-style refs to jj revsets
			const jjRef = gitRefToJjRevset(ref);
			await jj(repoPath, ["log", "-r", jjRef, "--no-graph", "--limit", "1"]);
			return true;
		} catch {
			return false;
		}
	}

	async hasOriginRemote(mainRepoPath: string): Promise<boolean> {
		try {
			const output = await jj(mainRepoPath, ["git", "remote", "list"]);
			for (const line of output.split("\n")) {
				if (line.trim().startsWith("origin")) {
					return true;
				}
			}
			return false;
		} catch {
			return false;
		}
	}

	async branchExistsOnRemote(
		repoPath: string,
		branch: string,
	): Promise<BranchExistsOnRemoteResult> {
		try {
			const output = await jj(repoPath, ["bookmark", "list", "--all-remotes"]);

			// Look for "branch@origin:" in the output
			const remotePattern = `${branch}@origin`;
			for (const line of output.split("\n")) {
				if (line.trim().startsWith(remotePattern)) {
					return { status: "exists" };
				}
			}

			return { status: "not_found" };
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			return { status: "error", message: msg };
		}
	}

	async getRepoRoot(path: string): Promise<string> {
		const env = await getJjEnv();
		const { stdout } = await execFileAsync("jj", ["root", "-R", path], {
			env,
			timeout: 10_000,
		});
		return stdout.trim();
	}

	async getBaseBranchConfig(
		repoPath: string,
		branch: string,
	): Promise<string | null> {
		// jj repos don't use git config for base branch.
		// We store this in the superset local DB via the worktrees table.
		// However, the VcsProvider interface is called with the repo path, not the DB.
		// For colocated repos, fall back to reading git config (which may exist
		// from before jj support was added, or was set by the git provider).
		try {
			const env = await getJjEnv();
			const { stdout } = await execFileAsync(
				"git",
				["-C", repoPath, "config", `branch.${branch}.base`],
				{ env, timeout: 5_000 },
			);
			return stdout.trim() || null;
		} catch {
			return null;
		}
	}

	async setBaseBranchConfig(
		repoPath: string,
		branch: string,
		baseBranch: string,
	): Promise<void> {
		// For colocated repos, use git config (same as GitProvider)
		// since .git exists alongside .jj
		try {
			const env = await getJjEnv();
			await execFileAsync(
				"git",
				["-C", repoPath, "config", `branch.${branch}.base`, baseBranch],
				{ env, timeout: 5_000 },
			);
		} catch {}
	}
}

/**
 * Convert a git-style ref to a jj revset.
 * Examples:
 *   "origin/main" → "main@origin"
 *   "main" → "main"
 *   "origin/feature/foo" → "feature/foo@origin"
 */
function gitRefToJjRevset(ref: string): string {
	if (ref.startsWith("origin/")) {
		const branch = ref.slice("origin/".length);
		return `${branch}@origin`;
	}
	return ref;
}
