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

	/**
	 * Detect the main branch of a repository
	 * Tries: main, master, then git's default branch
	 */
	async detectMainBranch(repoPath: string): Promise<string> {
		// Try common main branch names
		const candidates = ["main", "master"];

		for (const candidate of candidates) {
			try {
				await execAsync(`git rev-parse --verify ${candidate}`, {
					cwd: repoPath,
				});
				return candidate;
			} catch {
				// Try remote version
				try {
					await execAsync(`git rev-parse --verify origin/${candidate}`, {
						cwd: repoPath,
					});
					return `origin/${candidate}`;
				} catch {
					// Continue to next candidate
				}
			}
		}

		// Fallback: try to get git's default branch
		try {
			const result = await execAsync(
				"git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'",
				{ cwd: repoPath },
			);
			const defaultBranch = result.stdout.trim();
			if (defaultBranch) {
				return defaultBranch;
			}
		} catch {
			// Ignore errors
		}

		// Last resort: return "main" and let caller handle the error
		return "main";
	}

	/**
	 * Check if a file should be excluded from diff (build artifacts, dependencies, etc.)
	 */
	private shouldExcludeFile(filePath: string): boolean {
		const excludePatterns = [
			// Dependencies
			/node_modules/,
			/\.pnp\./,
			/\.yarn\//,
			// Build outputs
			/\/dist\//,
			/\/dist-ssr\//,
			/\/dist-electron\//,
			/\/build\//,
			/\/\.next\//,
			/\/out\//,
			/\/release\//,
			/\/coverage\//,
			// Lock files
			/package-lock\.json$/,
			/yarn\.lock$/,
			/pnpm-lock\.yaml$/,
			// Environment files
			/\.env$/,
			/\.env\./,
			// Editor files
			/\.DS_Store$/,
			/\.vscode\//,
			/\.idea\//,
			// Cache files
			/\.turbo\//,
			/\.eslintcache$/,
			/\.tsbuildinfo$/,
			// Test results
			/\/test-results\//,
			/\/playwright-report\//,
			/\/playwright\/\.cache\//,
			// Temporary files
			/\.tmp\//,
			// Electron build artifacts
			/electron\.vite\.config\.\d+\.mjs$/,
		];

		return excludePatterns.some((pattern) => pattern.test(filePath));
	}

	async getGitDiffFileList(
		worktreePath: string,
		_configuredBranch: string,
	): Promise<{
		success: boolean;
		files?: Array<{
			id: string;
			fileName: string;
			filePath: string;
			status: "added" | "deleted" | "modified" | "renamed";
			oldPath?: string;
			additions: number;
			deletions: number;
		}>;
		error?: string;
	}> {
		try {
			// Detect the actual main branch (main/master) instead of using configured branch
			// This ensures we always compare against the main branch, not a feature branch
			// Get the actual git repository root (works for both regular repos and worktrees)
			let repoPath = worktreePath;
			try {
				const gitDirResult = await execAsync("git rev-parse --show-toplevel", {
					cwd: worktreePath,
				});
				repoPath = gitDirResult.stdout.trim();
			} catch {
				// Fallback: try to find .git directory
				let currentPath = worktreePath;
				while (currentPath !== "/" && currentPath !== "") {
					if (existsSync(path.join(currentPath, ".git"))) {
						repoPath = currentPath;
						break;
					}
					currentPath = path.dirname(currentPath);
				}
			}

			const mainBranch = await this.detectMainBranch(repoPath);

			// Verify mainBranch exists
			try {
				await execAsync(`git rev-parse --verify ${mainBranch}`, {
					cwd: worktreePath,
				});
			} catch {
				return {
					success: false,
					error: `Main branch "${mainBranch}" not found in repository`,
				};
			}

			// Get list of changed files with status
			// Using three-dot syntax to show only committed changes (HEAD vs mainBranch)
			const diffFilesResult = await execAsync(
				`git diff ${mainBranch}...HEAD --name-status`,
				{ cwd: worktreePath },
			);

			const fileLines = diffFilesResult.stdout
				.trim()
				.split("\n")
				.filter(Boolean);

			const files = [];

			for (let i = 0; i < fileLines.length; i++) {
				const fileLine = fileLines[i];
				const parts = fileLine.split("\t");
				const statusCode = parts[0];
				const filePath = parts[1];
				const oldPath = parts[2]; // For renamed files

				// Check if file should be excluded
				if (this.shouldExcludeFile(filePath) || (oldPath && this.shouldExcludeFile(oldPath))) {
					continue;
				}

				// Determine status
				let status: "added" | "deleted" | "modified" | "renamed" = "modified";
				if (statusCode.startsWith("A")) status = "added";
				else if (statusCode.startsWith("D")) status = "deleted";
				else if (statusCode.startsWith("R")) status = "renamed";
				else if (statusCode.startsWith("M")) status = "modified";

				// Get stats only (additions/deletions) without full diff content
				const statCommand =
					status === "deleted"
						? `git diff ${mainBranch} --numstat -- "${filePath}"`
						: `git diff ${mainBranch} --numstat -- "${oldPath || filePath}"`;

				let additions = 0;
				let deletions = 0;

				try {
					const statResult = await execAsync(statCommand, {
						cwd: worktreePath,
					});
					const statLine = statResult.stdout.trim();
					if (statLine) {
						const statParts = statLine.split("\t");
						if (statParts.length >= 2) {
							additions = parseInt(statParts[0], 10) || 0;
							deletions = parseInt(statParts[1], 10) || 0;
						}
					}
				} catch {
					// If stat fails, try to get from shortstat
					try {
						const shortStatResult = await execAsync(
							`git diff ${mainBranch} --shortstat -- "${oldPath || filePath}"`,
							{ cwd: worktreePath },
						);
						const shortStat = shortStatResult.stdout.trim();
						const additionsMatch = shortStat.match(/(\d+)\s+insertion/);
						const deletionsMatch = shortStat.match(/(\d+)\s+deletion/);
						if (additionsMatch) {
							additions = parseInt(additionsMatch[1], 10) || 0;
						}
						if (deletionsMatch) {
							deletions = parseInt(deletionsMatch[1], 10) || 0;
						}
					} catch {
						// If both fail, leave as 0
					}
				}

				const fileName = path.basename(oldPath || filePath);
				files.push({
					id: `file-${i}`,
					fileName,
					filePath: oldPath || filePath,
					status,
					...(oldPath && { oldPath: filePath }),
					additions,
					deletions,
				});
			}

			return {
				success: true,
				files,
			};
		} catch (error) {
			console.error("Failed to get git diff file list:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Get detailed diff content for a single file - lazy loading
	 */
	async getGitDiffFile(
		worktreePath: string,
		mainBranch: string,
		filePath: string,
		oldPath: string | undefined,
		status: "added" | "deleted" | "modified" | "renamed",
	): Promise<{
		success: boolean;
		changes?: Array<{
			type: "added" | "removed" | "modified" | "unchanged";
			oldLineNumber: number | null;
			newLineNumber: number | null;
			content: string;
		}>;
		error?: string;
	}> {
		try {
			// Get detailed diff for this file
			// Use three-dot syntax to show only committed changes (HEAD vs mainBranch)
			const diffCommand =
				status === "deleted"
					? `git diff ${mainBranch}...HEAD -- "${filePath}"`
					: `git diff ${mainBranch}...HEAD -- "${oldPath || filePath}"`;

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

			const diffLines = diffOutput.split("\n");
			// Only include 3 lines of context around changes to reduce data size
			// This dramatically reduces memory usage for large files with few changes
			const CONTEXT_LINES = 3;
			let contextBuffer: Array<{
				type: "unchanged";
				oldLineNumber: number;
				newLineNumber: number;
				content: string;
			}> = [];

			for (let i = 0; i < diffLines.length; i++) {
				const line = diffLines[i];

				// Parse hunk headers (e.g., @@ -1,4 +1,5 @@)
				if (line.startsWith("@@")) {
					const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
					if (match) {
						oldLineNum = parseInt(match[1], 10);
						newLineNum = parseInt(match[2], 10);
					}
					// Flush context buffer when starting a new hunk
					contextBuffer = [];
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
					// Flush context buffer before adding change
					if (contextBuffer.length > 0) {
						// Only include up to CONTEXT_LINES from buffer
						const contextToInclude = contextBuffer.slice(-CONTEXT_LINES);
						changes.push(...contextToInclude);
						contextBuffer = [];
					}
					changes.push({
						type: "added",
						oldLineNumber: null,
						newLineNumber: newLineNum,
						content: line.substring(1),
					});
					newLineNum++;
				} else if (line.startsWith("-")) {
					// Flush context buffer before removing change
					if (contextBuffer.length > 0) {
						const contextToInclude = contextBuffer.slice(-CONTEXT_LINES);
						changes.push(...contextToInclude);
						contextBuffer = [];
					}
					changes.push({
						type: "removed",
						oldLineNumber: oldLineNum,
						newLineNumber: null,
						content: line.substring(1),
					});
					oldLineNum++;
				} else if (line.startsWith(" ")) {
					// Store unchanged lines in buffer (only keep last CONTEXT_LINES)
					contextBuffer.push({
						type: "unchanged",
						oldLineNumber: oldLineNum,
						newLineNumber: newLineNum,
						content: line.substring(1),
					});
					// Keep buffer size limited
					if (contextBuffer.length > CONTEXT_LINES * 2) {
						contextBuffer.shift();
					}
					oldLineNum++;
					newLineNum++;
				}
			}

			return {
				success: true,
				changes,
			};
		} catch (error) {
			console.error("Failed to get git diff file:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Create a pull request for a worktree using gh CLI
	 */
	async createPullRequest(
		worktreePath: string,
		sourceBranch: string,
		baseBranch: string,
	): Promise<{
		success: boolean;
		prUrl?: string;
		error?: string;
	}> {
		try {
			// Step 1: Check if there are uncommitted changes and commit them
			const hasUncommitted = this.hasUncommittedChanges(worktreePath);
			if (hasUncommitted) {
				try {
					// Stage all changes
					execSync("git add .", {
						cwd: worktreePath,
						stdio: "pipe",
					});

					// Create commit with auto-generated message
					const commitMessage = `Work in progress\n\nAuto-committed for PR creation`;
					execSync(`git commit -m "${commitMessage}"`, {
						cwd: worktreePath,
						stdio: "pipe",
					});

					console.log("Auto-committed uncommitted changes");
				} catch (commitError) {
					console.error("Failed to commit changes:", commitError);
					return {
						success: false,
						error:
							"Failed to commit changes. Please commit manually and try again.",
					};
				}
			}

			// Step 2: Check if there are any commits between base and source
			let hasCommits = false;
			try {
				const commitCount = execSync(
					`git rev-list --count ${baseBranch}..${sourceBranch}`,
					{
						cwd: worktreePath,
						encoding: "utf-8",
						stdio: "pipe",
					},
				).trim();

				hasCommits = commitCount !== "0";
			} catch (countError) {
				console.error("Failed to check commit count:", countError);
				// Continue anyway - might be a new branch
				hasCommits = true; // Assume we have commits
			}

			if (!hasCommits) {
				return {
					success: false,
					error: `No commits found between ${baseBranch} and ${sourceBranch}. Make some changes first.`,
				};
			}

			// Step 3: Push the branch to remote
			try {
				execSync(`git push -u origin ${sourceBranch}`, {
					cwd: worktreePath,
					stdio: "pipe",
				});
			} catch (pushError) {
				const errorStr = String(pushError);
				// Only ignore if branch already exists or is up-to-date
				if (
					!errorStr.includes("already exists") &&
					!errorStr.includes("up-to-date")
				) {
					console.error("Failed to push branch:", errorStr);
					return {
						success: false,
						error:
							"Failed to push branch to remote. Please push manually and try again.",
					};
				}
			}

			// Step 4: Create PR using gh CLI
			let prUrl: string | undefined;

			// Try with --fill first (uses commit messages)
			try {
				const result = execSync(
					`gh pr create --base ${baseBranch} --head ${sourceBranch} --fill`,
					{
						cwd: worktreePath,
						encoding: "utf-8",
						stdio: "pipe",
					},
				);

				// Extract the PR URL from the output
				// gh pr create outputs the URL, but may have other text
				const output = result.trim();
				console.log(`Raw gh pr create output: "${output}"`);

				const urlMatch = output.match(/(https:\/\/github\.com\/[^\s]+)/);
				if (urlMatch) {
					prUrl = urlMatch[1];
					console.log(`Extracted PR URL: ${prUrl}`);
				} else {
					// If no URL found in output, try to get it from gh pr list
					console.log("No URL in create output, fetching from pr list");
					try {
						const prListResult = execSync(
							`gh pr list --head ${sourceBranch} --json url --jq '.[0].url'`,
							{
								cwd: worktreePath,
								encoding: "utf-8",
								stdio: "pipe",
							},
						);
						prUrl = prListResult.trim();
					} catch (listError) {
						console.warn("Could not fetch PR URL from list:", listError);
						prUrl = undefined;
					}
				}
			} catch (fillError) {
				// If --fill fails, try with web interface instead
				console.log("--fill failed, opening web interface");
				try {
					execSync(
						`gh pr create --base ${baseBranch} --head ${sourceBranch} --web`,
						{
							cwd: worktreePath,
							stdio: "inherit", // Let it open the browser directly
						},
					);

					// Poll for the PR URL after web creation
					// User needs to complete the PR in the browser, so we poll
					console.log("Polling for PR URL after web creation...");
					let attempts = 0;
					const maxAttempts = 30; // Poll for up to 30 seconds

					while (attempts < maxAttempts) {
						await new Promise((resolve) => setTimeout(resolve, 1000));
						attempts++;

						try {
							const prListResult = execSync(
								`gh pr list --head ${sourceBranch} --json url --jq '.[0].url'`,
								{
									cwd: worktreePath,
									encoding: "utf-8",
									stdio: "pipe",
								},
							);
							const fetchedUrl = prListResult.trim();
							if (fetchedUrl && fetchedUrl.startsWith("http")) {
								prUrl = fetchedUrl;
								console.log(`Found PR URL after ${attempts} seconds: ${prUrl}`);
								break;
							}
						} catch (listError) {
							// PR not found yet, continue polling
							if (attempts % 5 === 0) {
								console.log(`Still waiting for PR creation... (${attempts}s)`);
							}
						}
					}

					if (!prUrl) {
						console.warn(
							"Could not fetch PR URL after web creation - user may not have completed the PR",
						);
					}
				} catch (webError) {
					console.error("Web PR creation failed:", webError);
					return {
						success: false,
						error: "Failed to create PR via web interface",
					};
				}
			}

			return {
				success: true,
				prUrl,
			};
		} catch (error) {
			console.error("Failed to create PR:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Provide helpful error messages
			if (errorMessage.includes("could not find any commits")) {
				return {
					success: false,
					error: "No commits to create PR from. Make some changes first.",
				};
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Merge a pull request using gh CLI
	 */
	async mergePullRequest(
		worktreePath: string,
		prUrl: string,
	): Promise<{
		success: boolean;
		error?: string;
	}> {
		try {
			// Extract PR number from URL (e.g., https://github.com/owner/repo/pull/123 -> 123)
			const prMatch = prUrl.match(/\/pull\/(\d+)/);
			if (!prMatch) {
				return {
					success: false,
					error: "Invalid PR URL format",
				};
			}

			const prNumber = prMatch[1];

			// Merge the PR using gh CLI with squash merge
			execSync(`gh pr merge ${prNumber} --squash --delete-branch`, {
				cwd: worktreePath,
				stdio: "pipe",
			});

			return {
				success: true,
			};
		} catch (error) {
			console.error("Failed to merge PR:", error);
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			return {
				success: false,
				error: errorMessage,
			};
		}
	}
}

export default WorktreeManager.getInstance();
