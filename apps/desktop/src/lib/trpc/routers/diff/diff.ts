import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import type { ChangedFile, Commit, FileStatus } from "./types";
import { parseGitDiff } from "./utils/parse-diff";
import { detectParentBranch, getCurrentBranch } from "./utils/parent-branch";

/**
 * Parse git status --porcelain output into ChangedFile array
 */
function parseGitStatus(statusOutput: string): ChangedFile[] {
	const files: ChangedFile[] = [];
	const lines = statusOutput.trim().split("\n").filter(Boolean);

	for (const line of lines) {
		if (line.length < 3) continue;

		const indexStatus = line[0];
		const workTreeStatus = line[1];
		const filePath = line.slice(3);

		// Determine the effective status
		// Index status (staged), work tree status (unstaged)
		let status: FileStatus;

		if (workTreeStatus === "M" || indexStatus === "M") {
			status = "M";
		} else if (workTreeStatus === "A" || indexStatus === "A") {
			status = "A";
		} else if (workTreeStatus === "D" || indexStatus === "D") {
			status = "D";
		} else if (indexStatus === "R") {
			status = "R";
		} else if (indexStatus === "C") {
			status = "C";
		} else if (workTreeStatus === "?" || indexStatus === "?") {
			status = "?";
		} else if (workTreeStatus === "U" || indexStatus === "U") {
			status = "U";
		} else {
			status = "M"; // Default to modified
		}

		// Handle renamed files (format: "R  old -> new")
		let path = filePath;
		let oldPath: string | undefined;
		if (status === "R" && filePath.includes(" -> ")) {
			const parts = filePath.split(" -> ");
			oldPath = parts[0];
			path = parts[1];
		}

		files.push({
			path,
			status,
			oldPath,
			additions: 0, // Will be populated by numstat
			deletions: 0,
		});
	}

	return files;
}

/**
 * Parse git diff --numstat output to get line counts
 */
function parseNumstat(
	numstatOutput: string,
): Map<string, { additions: number; deletions: number }> {
	const stats = new Map<string, { additions: number; deletions: number }>();
	const lines = numstatOutput.trim().split("\n").filter(Boolean);

	for (const line of lines) {
		const parts = line.split("\t");
		if (parts.length >= 3) {
			const additions =
				parts[0] === "-" ? 0 : Number.parseInt(parts[0], 10) || 0;
			const deletions =
				parts[1] === "-" ? 0 : Number.parseInt(parts[1], 10) || 0;
			const filePath = parts[2];

			// Handle renamed files (format: "old => new" or "{prefix => suffix}")
			let normalizedPath = filePath;
			if (filePath.includes(" => ")) {
				// Extract the new path from rename notation
				normalizedPath = filePath.replace(/.*\{.*? => (.*?)\}.*/, "$1");
				if (normalizedPath === filePath) {
					// Simple rename without braces
					normalizedPath = filePath.split(" => ")[1] || filePath;
				}
			}

			stats.set(normalizedPath, { additions, deletions });
		}
	}

	return stats;
}

export const createDiffRouter = () => {
	return router({
		/**
		 * Get list of changed files for a diff mode
		 */
		getChangedFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					mode: z.enum(["unstaged", "staged", "all-changes", "range"]),
					range: z
						.object({
							from: z.string(),
							to: z.string(),
						})
						.optional(),
				}),
			)
			.query(async ({ input }): Promise<ChangedFile[]> => {
				const git = simpleGit(input.worktreePath);

				switch (input.mode) {
					case "unstaged": {
						// Get status for unstaged/untracked files
						const status = await git.raw(["status", "--porcelain"]);
						const files = parseGitStatus(status);

						// Get line counts for modified files
						const numstat = await git.raw(["diff", "--numstat"]);
						const stats = parseNumstat(numstat);

						// Merge stats into files
						for (const file of files) {
							const fileStat = stats.get(file.path);
							if (fileStat) {
								file.additions = fileStat.additions;
								file.deletions = fileStat.deletions;
							}
						}

						return files;
					}

					case "staged": {
						// Get staged files
						const status = await git.raw(["status", "--porcelain"]);
						const allFiles = parseGitStatus(status);
						const stagedFiles = allFiles.filter((f) => f.status !== "?");

						// Get line counts for staged files
						const numstat = await git.raw(["diff", "--cached", "--numstat"]);
						const stats = parseNumstat(numstat);

						for (const file of stagedFiles) {
							const fileStat = stats.get(file.path);
							if (fileStat) {
								file.additions = fileStat.additions;
								file.deletions = fileStat.deletions;
							}
						}

						return stagedFiles;
					}

					case "all-changes": {
						const parentBranch = await detectParentBranch(input.worktreePath);

						// Get files changed compared to parent branch
						const diffOutput = await git.raw([
							"diff",
							"--name-status",
							`${parentBranch}...HEAD`,
						]);

						const files: ChangedFile[] = [];
						const lines = diffOutput.trim().split("\n").filter(Boolean);

						for (const line of lines) {
							const parts = line.split("\t");
							if (parts.length >= 2) {
								const statusChar = parts[0][0] as FileStatus;
								const path = parts[parts.length - 1];
								const oldPath =
									parts[0].startsWith("R") && parts.length === 3
										? parts[1]
										: undefined;

								files.push({
									path,
									status: statusChar,
									oldPath,
									additions: 0,
									deletions: 0,
								});
							}
						}

						// Get line counts
						const numstat = await git.raw([
							"diff",
							"--numstat",
							`${parentBranch}...HEAD`,
						]);
						const stats = parseNumstat(numstat);

						for (const file of files) {
							const fileStat = stats.get(file.path);
							if (fileStat) {
								file.additions = fileStat.additions;
								file.deletions = fileStat.deletions;
							}
						}

						return files;
					}

					case "range": {
						if (!input.range) {
							throw new Error("Range required for range mode");
						}

						const { from, to } = input.range;

						// Get files changed in range
						const diffOutput = await git.raw([
							"diff",
							"--name-status",
							`${from}..${to}`,
						]);

						const files: ChangedFile[] = [];
						const lines = diffOutput.trim().split("\n").filter(Boolean);

						for (const line of lines) {
							const parts = line.split("\t");
							if (parts.length >= 2) {
								const statusChar = parts[0][0] as FileStatus;
								const path = parts[parts.length - 1];
								const oldPath =
									parts[0].startsWith("R") && parts.length === 3
										? parts[1]
										: undefined;

								files.push({
									path,
									status: statusChar,
									oldPath,
									additions: 0,
									deletions: 0,
								});
							}
						}

						// Get line counts
						const numstat = await git.raw(["diff", "--numstat", `${from}..${to}`]);
						const stats = parseNumstat(numstat);

						for (const file of files) {
							const fileStat = stats.get(file.path);
							if (fileStat) {
								file.additions = fileStat.additions;
								file.deletions = fileStat.deletions;
							}
						}

						return files;
					}
				}
			}),

		/**
		 * Get all diffs for all changed files at once (for infinite scroll view)
		 */
		getAllDiffs: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					mode: z.enum(["unstaged", "staged", "all-changes", "range"]),
					range: z
						.object({
							from: z.string(),
							to: z.string(),
						})
						.optional(),
				}),
			)
			.query(async ({ input }) => {
				const git = simpleGit(input.worktreePath);

				// First get the list of changed files
				let files: ChangedFile[] = [];
				let diffBase: string[];

				switch (input.mode) {
					case "unstaged": {
						const status = await git.raw(["status", "--porcelain"]);
						files = parseGitStatus(status);
						diffBase = ["diff"];
						break;
					}
					case "staged": {
						const status = await git.raw(["status", "--porcelain"]);
						files = parseGitStatus(status).filter((f) => f.status !== "?");
						diffBase = ["diff", "--cached"];
						break;
					}
					case "all-changes": {
						const parentBranch = await detectParentBranch(input.worktreePath);
						const diffOutput = await git.raw([
							"diff",
							"--name-status",
							`${parentBranch}...HEAD`,
						]);
						const lines = diffOutput.trim().split("\n").filter(Boolean);
						for (const line of lines) {
							const parts = line.split("\t");
							if (parts.length >= 2) {
								const statusChar = parts[0][0] as FileStatus;
								const path = parts[parts.length - 1];
								files.push({
									path,
									status: statusChar,
									additions: 0,
									deletions: 0,
								});
							}
						}
						diffBase = ["diff", `${parentBranch}...HEAD`];
						break;
					}
					case "range": {
						if (!input.range) {
							throw new Error("Range required for range mode");
						}
						const diffOutput = await git.raw([
							"diff",
							"--name-status",
							`${input.range.from}..${input.range.to}`,
						]);
						const lines = diffOutput.trim().split("\n").filter(Boolean);
						for (const line of lines) {
							const parts = line.split("\t");
							if (parts.length >= 2) {
								const statusChar = parts[0][0] as FileStatus;
								const path = parts[parts.length - 1];
								files.push({
									path,
									status: statusChar,
									additions: 0,
									deletions: 0,
								});
							}
						}
						diffBase = ["diff", `${input.range.from}..${input.range.to}`];
						break;
					}
				}

				// Get all diffs in parallel
				const diffs = await Promise.all(
					files.map(async (file) => {
						const rawDiff = await git.raw([...diffBase, "--", file.path]);
						return parseGitDiff(rawDiff, file.path);
					}),
				);

				return diffs;
			}),

		/**
		 * Get diff content for a specific file
		 */
		getFileDiff: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					mode: z.enum(["unstaged", "staged", "all-changes", "range"]),
					range: z
						.object({
							from: z.string(),
							to: z.string(),
						})
						.optional(),
				}),
			)
			.query(async ({ input }) => {
				const git = simpleGit(input.worktreePath);
				let rawDiff: string;

				switch (input.mode) {
					case "unstaged":
						rawDiff = await git.raw(["diff", "--", input.filePath]);
						break;

					case "staged":
						rawDiff = await git.raw(["diff", "--cached", "--", input.filePath]);
						break;

					case "all-changes": {
						const parentBranch = await detectParentBranch(input.worktreePath);
						rawDiff = await git.raw([
							"diff",
							`${parentBranch}...HEAD`,
							"--",
							input.filePath,
						]);
						break;
					}

					case "range": {
						if (!input.range) {
							throw new Error("Range required for range mode");
						}
						rawDiff = await git.raw([
							"diff",
							`${input.range.from}..${input.range.to}`,
							"--",
							input.filePath,
						]);
						break;
					}
				}

				return parseGitDiff(rawDiff, input.filePath);
			}),

		/**
		 * Get parent branch for "all-changes" mode
		 */
		getParentBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				return detectParentBranch(input.worktreePath);
			}),

		/**
		 * Get current branch name
		 */
		getCurrentBranch: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				return getCurrentBranch(input.worktreePath);
			}),

		/**
		 * Get commit history for range selector
		 */
		getCommitHistory: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					limit: z.number().default(50),
				}),
			)
			.query(async ({ input }): Promise<Commit[]> => {
				const git = simpleGit(input.worktreePath);
				const log = await git.log({ maxCount: input.limit });

				return log.all.map((commit) => ({
					sha: commit.hash,
					shortSha: commit.hash.substring(0, 7),
					message: commit.message.split("\n")[0], // First line only
					author: commit.author_name,
					date: commit.date,
				}));
			}),

		/**
		 * Get list of branches for range selector
		 */
		getBranches: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const git = simpleGit(input.worktreePath);
				const branches = await git.branchLocal();

				return {
					current: branches.current,
					branches: branches.all,
				};
			}),
	});
};

export type DiffRouter = ReturnType<typeof createDiffRouter>;
