import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type {
	ChangedFile,
	FileContents,
	GitChangesStatus,
} from "shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	detectLanguage,
	parseDiffNumstat,
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "./utils/parse-status";

export const createChangesRouter = () => {
	return router({
		getBranches: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(
				async ({
					input,
				}): Promise<{
					local: string[];
					remote: string[];
					defaultBranch: string;
				}> => {
					const git = simpleGit(input.worktreePath);

					const branchSummary = await git.branch(["-a"]);

					const local: string[] = [];
					const remote: string[] = [];

					for (const name of Object.keys(branchSummary.branches)) {
						if (name.startsWith("remotes/origin/")) {
							if (name === "remotes/origin/HEAD") continue;
							const remoteName = name.replace("remotes/origin/", "");
							remote.push(remoteName);
						} else {
							local.push(name);
						}
					}

					let defaultBranch = "main";
					try {
						const headRef = await git.raw([
							"symbolic-ref",
							"refs/remotes/origin/HEAD",
						]);
						const match = headRef.match(/refs\/remotes\/origin\/(.+)/);
						if (match) {
							defaultBranch = match[1].trim();
						}
					} catch {
						if (remote.includes("master") && !remote.includes("main")) {
							defaultBranch = "master";
						}
					}

					return {
						local: local.sort(),
						remote: remote.sort(),
						defaultBranch,
					};
				},
			),

		getStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				const git = simpleGit(input.worktreePath);
				const defaultBranch = input.defaultBranch || "main";

				const status = await git.status();
				const parsed = parseGitStatus(status);

				let commits: GitChangesStatus["commits"] = [];
				let againstMain: ChangedFile[] = [];
				let ahead = 0;
				let behind = 0;

				try {
					const tracking = await git.raw([
						"rev-list",
						"--left-right",
						"--count",
						`origin/${defaultBranch}...HEAD`,
					]);
					const [behindStr, aheadStr] = tracking.trim().split(/\s+/);
					behind = Number.parseInt(behindStr || "0", 10);
					ahead = Number.parseInt(aheadStr || "0", 10);

					const logOutput = await git.raw([
						"log",
						`origin/${defaultBranch}..HEAD`,
						"--format=%H|%h|%s|%an|%aI",
					]);
					commits = parseGitLog(logOutput);

					if (ahead > 0) {
						const nameStatus = await git.raw([
							"diff",
							"--name-status",
							`origin/${defaultBranch}...HEAD`,
						]);
						againstMain = parseNameStatus(nameStatus);

						const numstat = await git.raw([
							"diff",
							"--numstat",
							`origin/${defaultBranch}...HEAD`,
						]);
						const stats = parseDiffNumstat(numstat);
						for (const file of againstMain) {
							const fileStat = stats.get(file.path);
							if (fileStat) {
								file.additions = fileStat.additions;
								file.deletions = fileStat.deletions;
							}
						}
					}
				} catch {}

				if (parsed.staged.length > 0) {
					try {
						const stagedNumstat = await git.raw([
							"diff",
							"--cached",
							"--numstat",
						]);
						const stagedStats = parseDiffNumstat(stagedNumstat);
						for (const file of parsed.staged) {
							const fileStat = stagedStats.get(file.path);
							if (fileStat) {
								file.additions = fileStat.additions;
								file.deletions = fileStat.deletions;
							}
						}
					} catch {}
				}

				if (parsed.unstaged.length > 0) {
					try {
						const unstagedNumstat = await git.raw(["diff", "--numstat"]);
						const unstagedStats = parseDiffNumstat(unstagedNumstat);
						for (const file of parsed.unstaged) {
							const fileStat = unstagedStats.get(file.path);
							if (fileStat) {
								file.additions = fileStat.additions;
								file.deletions = fileStat.deletions;
							}
						}
					} catch {}
				}

				for (const file of parsed.untracked) {
					try {
						const fullPath = join(input.worktreePath, file.path);
						const content = await readFile(fullPath, "utf-8");
						const lineCount = content.split("\n").length;
						file.additions = lineCount;
						file.deletions = 0;
					} catch {}
				}

				return {
					branch: parsed.branch,
					defaultBranch,
					againstMain,
					commits,
					staged: parsed.staged,
					unstaged: parsed.unstaged,
					untracked: parsed.untracked,
					ahead,
					behind,
				};
			}),

		getCommitFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
				}),
			)
			.query(async ({ input }): Promise<ChangedFile[]> => {
				const git = simpleGit(input.worktreePath);

				const nameStatus = await git.raw([
					"diff-tree",
					"--no-commit-id",
					"--name-status",
					"-r",
					input.commitHash,
				]);
				const files = parseNameStatus(nameStatus);

				const numstat = await git.raw([
					"diff-tree",
					"--no-commit-id",
					"--numstat",
					"-r",
					input.commitHash,
				]);
				const stats = parseDiffNumstat(numstat);
				for (const file of files) {
					const fileStat = stats.get(file.path);
					if (fileStat) {
						file.additions = fileStat.additions;
						file.deletions = fileStat.deletions;
					}
				}

				return files;
			}),

		getFileContents: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
					oldPath: z.string().optional(),
					category: z.enum(["against-main", "committed", "staged", "unstaged"]),
					commitHash: z.string().optional(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<FileContents> => {
				const git = simpleGit(input.worktreePath);
				const defaultBranch = input.defaultBranch || "main";
				const originalPath = input.oldPath || input.filePath;
				let original = "";
				let modified = "";

				switch (input.category) {
					case "against-main": {
						try {
							original = await git.show([
								`origin/${defaultBranch}:${originalPath}`,
							]);
						} catch {
							original = "";
						}
						try {
							modified = await git.show([`HEAD:${input.filePath}`]);
						} catch {
							modified = "";
						}
						break;
					}

					case "committed": {
						if (!input.commitHash) {
							throw new Error("commitHash required for committed category");
						}
						try {
							original = await git.show([
								`${input.commitHash}^:${originalPath}`,
							]);
						} catch {
							original = "";
						}
						try {
							modified = await git.show([
								`${input.commitHash}:${input.filePath}`,
							]);
						} catch {
							modified = "";
						}
						break;
					}

					case "staged": {
						try {
							original = await git.show([`HEAD:${originalPath}`]);
						} catch {
							original = "";
						}
						try {
							modified = await git.show([`:0:${input.filePath}`]);
						} catch {
							modified = "";
						}
						break;
					}

					case "unstaged": {
						try {
							original = await git.show([`:0:${originalPath}`]);
						} catch {
							try {
								original = await git.show([`HEAD:${originalPath}`]);
							} catch {
								original = "";
							}
						}
						try {
							modified = await readFile(
								join(input.worktreePath, input.filePath),
								"utf-8",
							);
						} catch {
							modified = "";
						}
						break;
					}
				}

				return {
					original,
					modified,
					language: detectLanguage(input.filePath),
				};
			}),

		stageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.add(input.filePath);
				return { success: true };
			}),

		unstageFile: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.reset(["HEAD", "--", input.filePath]);
				return { success: true };
			}),

		discardChanges: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				try {
					await git.checkout(["--", input.filePath]);
					return { success: true };
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new Error(`Failed to discard changes: ${message}`);
				}
			}),

		stageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.add("-A");
				return { success: true };
			}),

		unstageAll: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const git = simpleGit(input.worktreePath);
				await git.reset(["HEAD"]);
				return { success: true };
			}),

		deleteUntracked: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					filePath: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<{ success: boolean }> => {
				const fullPath = join(input.worktreePath, input.filePath);
				try {
					await rm(fullPath, { recursive: true, force: true });
					return { success: true };
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					throw new Error(`Failed to delete untracked path: ${message}`);
				}
			}),
	});
};
