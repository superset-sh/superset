import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	ChangedFile,
	GitChangesStatus,
} from "shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { applyNumstatToFiles } from "./utils/apply-numstat";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "./utils/parse-status";

export const createStatusRouter = () => {
	return router({
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

				const branchComparison = await getBranchComparison(git, defaultBranch);

				await applyNumstatToFiles(git, parsed.staged, [
					"diff",
					"--cached",
					"--numstat",
				]);

				await applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]);

				await applyUntrackedLineCount(input.worktreePath, parsed.untracked);

				return {
					branch: parsed.branch,
					defaultBranch,
					againstMain: branchComparison.againstMain,
					commits: branchComparison.commits,
					staged: parsed.staged,
					unstaged: parsed.unstaged,
					untracked: parsed.untracked,
					ahead: branchComparison.ahead,
					behind: branchComparison.behind,
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

				await applyNumstatToFiles(git, files, [
					"diff-tree",
					"--no-commit-id",
					"--numstat",
					"-r",
					input.commitHash,
				]);

				return files;
			}),
	});
};

interface BranchComparison {
	commits: GitChangesStatus["commits"];
	againstMain: ChangedFile[];
	ahead: number;
	behind: number;
}

async function getBranchComparison(
	git: ReturnType<typeof simpleGit>,
	defaultBranch: string,
): Promise<BranchComparison> {
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

			await applyNumstatToFiles(git, againstMain, [
				"diff",
				"--numstat",
				`origin/${defaultBranch}...HEAD`,
			]);
		}
	} catch {
		// Branch comparison may fail if no remote tracking - that's ok
	}

	return { commits, againstMain, ahead, behind };
}

async function applyUntrackedLineCount(
	worktreePath: string,
	untracked: ChangedFile[],
): Promise<void> {
	for (const file of untracked) {
		try {
			const fullPath = join(worktreePath, file.path);
			const content = await readFile(fullPath, "utf-8");
			const lineCount = content.split("\n").length;
			file.additions = lineCount;
			file.deletions = 0;
		} catch {
			// File may not be readable
		}
	}
}
