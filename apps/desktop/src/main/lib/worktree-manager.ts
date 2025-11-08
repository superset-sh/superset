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

			// Extract a cleaner error message from git output
			let errorMessage = error instanceof Error ? error.message : String(error);

			// Try to extract the fatal/error line from stderr for a cleaner message
			if (typeof error === "object" && error !== null && "stderr" in error) {
				const stderr = String((error as any).stderr);
				const fatalMatch = stderr.match(/fatal: (.+)/);
				const errorMatch = stderr.match(/error: (.+)/);

				if (fatalMatch) {
					errorMessage = fatalMatch[1].trim();
				} else if (errorMatch) {
					errorMessage = errorMatch[1].trim();
				}
			}

			return {
				success: false,
				error: errorMessage,
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

			return output
				.split("\n")
				.map((branch) => branch.trim())
				.filter(Boolean);
		} catch (error) {
			console.error("Failed to list branches:", error);
			return [];
		}
	}

	/**
	 * Check if a branch has been merged into another branch
	 */
	isBranchMerged(
		repoPath: string,
		branch: string,
		targetBranch: string,
	): boolean {
		try {
			// Use git branch --merged to check if branch is fully merged into targetBranch
			const output = execSync(`git branch --merged ${targetBranch}`, {
				cwd: repoPath,
				encoding: "utf-8",
			}).trim();

			// Parse branch names from output (remove leading * and whitespace)
			const mergedBranches = output
				.split("\n")
				.map((line) => line.trim().replace(/^\*\s*/, ""))
				.filter(Boolean);

			return mergedBranches.includes(branch);
		} catch (error) {
			console.error("Failed to check if branch is merged:", error);
			return false;
		}
	}

	/**
	 * Check if a branch can be merged into a target worktree
	 */
	async canMerge(
		targetWorktreePath: string,
		sourceBranch: string,
		sourceWorktreePath?: string,
	): Promise<{
		canMerge: boolean;
		reason?: string;
		targetHasUncommittedChanges?: boolean;
		sourceHasUncommittedChanges?: boolean;
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
			const targetStatus = execSync("git status --porcelain", {
				cwd: targetWorktreePath,
				encoding: "utf-8",
			}).trim();

			// Check if there are uncommitted changes in source worktree
			let sourceStatus = "";
			if (sourceWorktreePath) {
				sourceStatus = execSync("git status --porcelain", {
					cwd: sourceWorktreePath,
					encoding: "utf-8",
				}).trim();
			}

			// Allow merge but warn about uncommitted changes
			const targetHasUncommittedChanges = !!targetStatus;
			const sourceHasUncommittedChanges = !!sourceStatus;

			if (targetHasUncommittedChanges || sourceHasUncommittedChanges) {
				const warnings = [];
				if (targetHasUncommittedChanges) {
					warnings.push("target worktree has uncommitted changes");
				}
				if (sourceHasUncommittedChanges) {
					warnings.push("source worktree has uncommitted changes");
				}
				return {
					canMerge: true,
					targetHasUncommittedChanges,
					sourceHasUncommittedChanges,
					reason: warnings.join(", "),
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

	/**
	 * Check if a worktree has uncommitted changes
	 */
	hasUncommittedChanges(worktreePath: string): boolean {
		try {
			const status = execSync("git status --porcelain", {
				cwd: worktreePath,
				encoding: "utf-8",
			}).trim();

			return !!status;
		} catch (error) {
			console.error("Failed to check for uncommitted changes:", error);
			return false;
		}
	}

	/**
	 * Get detailed git status for a worktree
	 */
	async getGitStatus(
		worktreePath: string,
		mainBranch: string,
	): Promise<{
		success: boolean;
		status?: {
			branch: string;
			ahead: number;
			behind: number;
			files: {
				staged: Array<{ path: string; status: string }>;
				unstaged: Array<{ path: string; status: string }>;
				untracked: Array<{ path: string }>;
			};
			diffAgainstMain: string;
			isMerging: boolean;
			isRebasing: boolean;
			conflictFiles: string[];
		};
		error?: string;
	}> {
		try {
			// Get current branch
			const branchResult = await execAsync("git rev-parse --abbrev-ref HEAD", {
				cwd: worktreePath,
			});
			const branch = branchResult.stdout.trim();

			// Get ahead/behind counts
			let ahead = 0;
			let behind = 0;
			try {
				const revListResult = await execAsync(
					`git rev-list --left-right --count ${mainBranch}...HEAD`,
					{ cwd: worktreePath },
				);
				const [behindStr, aheadStr] = revListResult.stdout.trim().split("\t");
				behind = Number.parseInt(behindStr, 10) || 0;
				ahead = Number.parseInt(aheadStr, 10) || 0;
			} catch (error) {
				console.warn("Could not get ahead/behind counts:", error);
			}

			// Get file status
			const statusResult = await execAsync("git status --porcelain", {
				cwd: worktreePath,
			});
			const statusLines = statusResult.stdout
				.trim()
				.split("\n")
				.filter(Boolean);

			const staged: Array<{ path: string; status: string }> = [];
			const unstaged: Array<{ path: string; status: string }> = [];
			const untracked: Array<{ path: string }> = [];

			for (const line of statusLines) {
				const statusCode = line.substring(0, 2);
				const filePath = line.substring(3);

				if (statusCode[0] !== " " && statusCode[0] !== "?") {
					// Staged changes
					staged.push({ path: filePath, status: statusCode[0] });
				}
				if (statusCode[1] !== " " && statusCode[1] !== "?") {
					// Unstaged changes
					unstaged.push({ path: filePath, status: statusCode[1] });
				}
				if (statusCode === "??") {
					// Untracked files
					untracked.push({ path: filePath });
				}
			}

			// Get diff against main branch
			let diffAgainstMain = "";
			try {
				const diffResult = await execAsync(
					`git diff ${mainBranch}...HEAD --stat`,
					{ cwd: worktreePath },
				);
				diffAgainstMain = diffResult.stdout.trim();
			} catch (error) {
				console.warn("Could not get diff against main:", error);
			}

			// Check merge/rebase state
			const gitDir = path.join(worktreePath, ".git");
			const isMerging = existsSync(path.join(gitDir, "MERGE_HEAD"));
			const isRebasing =
				existsSync(path.join(gitDir, "rebase-merge")) ||
				existsSync(path.join(gitDir, "rebase-apply"));

			// Get conflict files
			const conflictFiles: string[] = [];
			if (isMerging || isRebasing) {
				for (const line of statusLines) {
					const statusCode = line.substring(0, 2);
					if (
						statusCode.includes("U") ||
						statusCode === "AA" ||
						statusCode === "DD"
					) {
						conflictFiles.push(line.substring(3));
					}
				}
			}

			return {
				success: true,
				status: {
					branch,
					ahead,
					behind,
					files: {
						staged,
						unstaged,
						untracked,
					},
					diffAgainstMain,
					isMerging,
					isRebasing,
					conflictFiles,
				},
			};
		} catch (error) {
			console.error("Failed to get git status:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get detailed git diff for a worktree (line-by-line changes)
	 */
	async getGitDiff(
		worktreePath: string,
		mainBranch: string,
	): Promise<{
		success: boolean;
		diff?: {
			files: Array<{
				id: string;
				fileName: string;
				filePath: string;
				status: "added" | "deleted" | "modified" | "renamed";
				oldPath?: string;
				additions: number;
				deletions: number;
				changes: Array<{
					type: "added" | "removed" | "modified" | "unchanged";
					oldLineNumber: number | null;
					newLineNumber: number | null;
					content: string;
				}>;
			}>;
		};
		error?: string;
	}> {
		try {
			// Get list of changed files with status
			// Using two-dot diff to show all changes (committed + uncommitted) vs main branch
			const diffFilesResult = await execAsync(
				`git diff ${mainBranch} --name-status`,
				{ cwd: worktreePath },
			);

			const fileLines = diffFilesResult.stdout
				.trim()
				.split("\n")
				.filter(Boolean);
			const files = [];

			for (const fileLine of fileLines) {
				const parts = fileLine.split("\t");
				const statusCode = parts[0];
				const filePath = parts[1];
				const oldPath = parts[2]; // For renamed files

				// Determine status
				let status: "added" | "deleted" | "modified" | "renamed" = "modified";
				if (statusCode.startsWith("A")) status = "added";
				else if (statusCode.startsWith("D")) status = "deleted";
				else if (statusCode.startsWith("R")) status = "renamed";
				else if (statusCode.startsWith("M")) status = "modified";

				// Get detailed diff for this file
				const diffCommand =
					status === "deleted"
						? `git diff ${mainBranch} -- "${filePath}"`
						: `git diff ${mainBranch} -- "${oldPath || filePath}"`;

				const fileDiffResult = await execAsync(diffCommand, {
					cwd: worktreePath,
					maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
				});

				const diffOutput = fileDiffResult.stdout;

				// Parse the diff output
				const changes: Array<{
					type: "added" | "removed" | "modified" | "unchanged";
					oldLineNumber: number | null;
					newLineNumber: number | null;
					content: string;
				}> = [];

				let oldLineNum = 0;
				let newLineNum = 0;
				let additions = 0;
				let deletions = 0;

				const diffLines = diffOutput.split("\n");
				for (let i = 0; i < diffLines.length; i++) {
					const line = diffLines[i];

					// Parse hunk headers (e.g., @@ -1,4 +1,5 @@)
					if (line.startsWith("@@")) {
						const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
						if (match) {
							oldLineNum = parseInt(match[1], 10);
							newLineNum = parseInt(match[2], 10);
						}
						continue;
					}

					// Skip file headers
					if (
						line.startsWith("diff --git") ||
						line.startsWith("index ") ||
						line.startsWith("---") ||
						line.startsWith("+++")
					) {
						continue;
					}

					// Parse actual changes
					if (line.startsWith("+")) {
						changes.push({
							type: "added",
							oldLineNumber: null,
							newLineNumber: newLineNum,
							content: line.substring(1),
						});
						newLineNum++;
						additions++;
					} else if (line.startsWith("-")) {
						changes.push({
							type: "removed",
							oldLineNumber: oldLineNum,
							newLineNumber: null,
							content: line.substring(1),
						});
						oldLineNum++;
						deletions++;
					} else if (line.startsWith(" ")) {
						changes.push({
							type: "unchanged",
							oldLineNumber: oldLineNum,
							newLineNumber: newLineNum,
							content: line.substring(1),
						});
						oldLineNum++;
						newLineNum++;
					}
				}

				const fileName = path.basename(oldPath || filePath);
				files.push({
					id: `file-${files.length}`,
					fileName,
					filePath: oldPath || filePath,
					status,
					...(oldPath && { oldPath: filePath }),
					additions,
					deletions,
					changes,
				});
			}

			return {
				success: true,
				diff: { files },
			};
		} catch (error) {
			console.error("Failed to get git diff:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

export default WorktreeManager.getInstance();
