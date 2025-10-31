import { exec, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface WorktreeInfo {
	path: string;
	branch: string;
	bare: boolean;
}

class WorktreeManager {
	private static instance: WorktreeManager;
	private worktreeBaseDir: string;

	private constructor() {
		this.worktreeBaseDir = path.join(os.homedir(), ".superset", "worktrees");
	}

	static getInstance(): WorktreeManager {
		if (!WorktreeManager.instance) {
			WorktreeManager.instance = new WorktreeManager();
		}
		return WorktreeManager.instance;
	}

	/**
	 * Get the path where a worktree for this branch would be created
	 */
	getWorktreePath(repoPath: string, branch: string): string {
		// Get repo name from path
		const repoName = path.basename(repoPath);
		// Sanitize branch name for filesystem
		const sanitizedBranch = branch.replace(/[^a-zA-Z0-9-_]/g, "-");
		return path.join(this.worktreeBaseDir, repoName, sanitizedBranch);
	}

	/**
	 * Check if a worktree exists for this branch
	 */
	worktreeExists(repoPath: string, branch: string): boolean {
		const worktreePath = this.getWorktreePath(repoPath, branch);
		return existsSync(worktreePath);
	}

	/**
	 * Create a new git worktree
	 */
	async createWorktree(
		repoPath: string,
		branch: string,
		createBranch = false,
		sourceBranch?: string,
	): Promise<{ success: boolean; path?: string; error?: string }> {
		try {
			const worktreePath = this.getWorktreePath(repoPath, branch);

			// Check if worktree already exists
			if (existsSync(worktreePath)) {
				return {
					success: true,
					path: worktreePath,
				};
			}

			// Build git worktree add command
			let command = `git worktree add "${worktreePath}"`;
			if (createBranch) {
				// When creating a new branch, optionally specify the source branch
				if (sourceBranch) {
					command += ` -b ${branch} ${sourceBranch}`;
				} else {
					command += ` -b ${branch}`;
				}
			} else {
				command += ` ${branch}`;
			}

			// Execute command asynchronously
			await execAsync(command, {
				cwd: repoPath,
			});

			return {
				success: true,
				path: worktreePath,
			};
		} catch (error) {
			console.error("Failed to create worktree:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * List all worktrees for a repository
	 */
	listWorktrees(repoPath: string): WorktreeInfo[] {
		try {
			const output = execSync("git worktree list --porcelain", {
				cwd: repoPath,
				encoding: "utf-8",
			});

			const worktrees: WorktreeInfo[] = [];
			const lines = output.split("\n");
			let currentWorktree: Partial<WorktreeInfo> = {};

			for (const line of lines) {
				if (line.startsWith("worktree ")) {
					currentWorktree.path = line.slice("worktree ".length);
				} else if (line.startsWith("branch ")) {
					currentWorktree.branch = line
						.slice("branch ".length)
						.replace("refs/heads/", "");
				} else if (line.startsWith("bare")) {
					currentWorktree.bare = true;
				} else if (line === "") {
					if (currentWorktree.path) {
						worktrees.push({
							path: currentWorktree.path,
							branch: currentWorktree.branch || "",
							bare: currentWorktree.bare || false,
						});
					}
					currentWorktree = {};
				}
			}

			return worktrees;
		} catch (error) {
			console.error("Failed to list worktrees:", error);
			return [];
		}
	}

	/**
	 * Remove a git worktree
	 */
	async removeWorktree(
		repoPath: string,
		worktreePath: string,
	): Promise<{ success: boolean; error?: string }> {
		try {
			await execAsync(`git worktree remove "${worktreePath}"`, {
				cwd: repoPath,
			});

			return { success: true };
		} catch (error) {
			console.error("Failed to remove worktree:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Check if a directory is a git repository
	 */
	isGitRepo(dirPath: string): boolean {
		try {
			execSync("git rev-parse --git-dir", {
				cwd: dirPath,
				stdio: "pipe",
			});
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get current branch in a repository
	 */
	getCurrentBranch(repoPath: string): string | null {
		try {
			const branch = execSync("git branch --show-current", {
				cwd: repoPath,
				encoding: "utf-8",
			}).trim();
			return branch || null;
		} catch (error) {
			console.error("Failed to get current branch:", error);
			return null;
		}
	}

	/**
	 * List all branches in a repository
	 */
	listBranches(repoPath: string): string[] {
		try {
			const output = execSync("git branch --format='%(refname:short)'", {
				cwd: repoPath,
				encoding: "utf-8",
			}).trim();

			if (!output) return [];

			return output.split("\n").map(branch => branch.trim()).filter(Boolean);
		} catch (error) {
			console.error("Failed to list branches:", error);
			return [];
		}
	}

	/**
	 * Check if a branch can be merged into a target worktree
	 */
	async canMerge(
		targetWorktreePath: string,
		sourceBranch: string,
	): Promise<{
		canMerge: boolean;
		reason?: string;
		hasUncommittedChanges?: boolean;
	}> {
		try {
			// Check if source branch exists
			try {
				execSync(`git rev-parse --verify ${sourceBranch}`, {
					cwd: targetWorktreePath,
					stdio: "pipe",
					encoding: "utf-8",
				});
			} catch {
				return { canMerge: false, reason: "Branch does not exist" };
			}

			// Check if there's an ongoing merge
			const mergeHeadPath = path.join(targetWorktreePath, ".git", "MERGE_HEAD");
			if (existsSync(mergeHeadPath)) {
				return {
					canMerge: false,
					reason: "Target worktree has unresolved merge conflicts",
				};
			}

			// Check if there are uncommitted changes in target worktree
			const status = execSync("git status --porcelain", {
				cwd: targetWorktreePath,
				encoding: "utf-8",
			}).trim();

			// Allow merge but warn about uncommitted changes
			if (status) {
				return {
					canMerge: true,
					hasUncommittedChanges: true,
					reason: "Target worktree has uncommitted changes",
				};
			}

			return { canMerge: true };
		} catch (error) {
			console.error("Failed to check if branch can be merged:", error);
			return {
				canMerge: false,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Merge a source branch into the target worktree's current branch
	 */
	async merge(
		targetWorktreePath: string,
		sourceBranch: string,
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Check if we can merge first
			const canMergeResult = await this.canMerge(
				targetWorktreePath,
				sourceBranch,
			);
			if (!canMergeResult.canMerge) {
				return {
					success: false,
					error: canMergeResult.reason || "Cannot merge branch",
				};
			}

			// Execute merge
			execSync(`git merge ${sourceBranch}`, {
				cwd: targetWorktreePath,
				stdio: "pipe",
			});

			return { success: true };
		} catch (error) {
			console.error("Failed to merge branch:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

export default WorktreeManager.getInstance();
