import type {
	ChangedFile,
	GitChangesStatus,
	TruncatedStatus,
} from "shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getStatusNoLock } from "../workspaces/utils/git";
import { assertRegisteredWorktree, secureFs } from "./security";
import { applyNumstatToFiles } from "./utils/apply-numstat";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "./utils/parse-status";

const MAX_UNTRACKED_FOR_LINE_COUNT = 200;
const MAX_FILES_FOR_NUMSTAT = 500;
const MAX_AHEAD_FOR_AGAINST_BASE = 200;

const statusInput = z.object({
	worktreePath: z.string(),
	defaultBranch: z.string().optional(),
});

type SimpleGit = ReturnType<typeof simpleGit>;

async function parseWorktreeInput(input: z.infer<typeof statusInput>) {
	assertRegisteredWorktree(input.worktreePath);
	const defaultBranch = input.defaultBranch || "main";
	const git = simpleGit(input.worktreePath);
	const status = await getStatusNoLock(input.worktreePath);
	const parsed = parseGitStatus(status);
	return { defaultBranch, git, parsed };
}

async function getAheadBehind(
	git: SimpleGit,
	defaultBranch: string,
): Promise<{ ahead: number; behind: number }> {
	try {
		const output = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			`origin/${defaultBranch}...HEAD`,
		]);
		const [behindStr, aheadStr] = output.trim().split(/\s+/);
		return {
			ahead: Number.parseInt(aheadStr || "0", 10),
			behind: Number.parseInt(behindStr || "0", 10),
		};
	} catch {
		return { ahead: 0, behind: 0 };
	}
}

export const createStatusRouter = () => {
	return router({
		getStatusQuick: publicProcedure
			.input(statusInput)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				const { defaultBranch, git, parsed } =
					await parseWorktreeInput(input);

				const [{ ahead, behind }, trackingStatus] = await Promise.all([
					getAheadBehind(git, defaultBranch),
					getTrackingBranchStatus(git),
				]);

				return {
					branch: parsed.branch,
					defaultBranch,
					againstBase: [],
					commits: [],
					staged: parsed.staged,
					unstaged: parsed.unstaged,
					untracked: parsed.untracked,
					ahead,
					behind,
					pushCount: trackingStatus.pushCount,
					pullCount: trackingStatus.pullCount,
					hasUpstream: trackingStatus.hasUpstream,
				};
			}),

		getStatus: publicProcedure
			.input(statusInput)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				const { defaultBranch, git, parsed } =
					await parseWorktreeInput(input);

				const truncated: TruncatedStatus = {};

				const totalFiles =
					parsed.staged.length +
					parsed.unstaged.length +
					parsed.untracked.length;
				const skipNumstat = totalFiles > MAX_FILES_FOR_NUMSTAT;
				const skipUntrackedLineCount =
					parsed.untracked.length > MAX_UNTRACKED_FOR_LINE_COUNT;

				if (skipNumstat) truncated.numstat = true;
				if (skipUntrackedLineCount) truncated.untrackedLineCount = true;

				const enrichmentTasks: Promise<unknown>[] = [];

				if (!skipNumstat) {
					enrichmentTasks.push(
						applyNumstatToFiles(git, parsed.staged, [
							"diff",
							"--cached",
							"--numstat",
						]),
						applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]),
					);
				}

				if (!skipUntrackedLineCount) {
					enrichmentTasks.push(
						applyUntrackedLineCount(input.worktreePath, parsed.untracked),
					);
				}

				const [branchComparison, trackingStatus] = await Promise.all([
					getBranchComparison(git, defaultBranch, MAX_AHEAD_FOR_AGAINST_BASE),
					getTrackingBranchStatus(git),
					...enrichmentTasks,
				]);

				if (branchComparison.truncatedAgainstBase) {
					truncated.againstBase = true;
				}

				const hasTruncation = Object.keys(truncated).length > 0;

				return {
					branch: parsed.branch,
					defaultBranch,
					againstBase: branchComparison.againstBase,
					commits: branchComparison.commits,
					staged: parsed.staged,
					unstaged: parsed.unstaged,
					untracked: parsed.untracked,
					ahead: branchComparison.ahead,
					behind: branchComparison.behind,
					pushCount: trackingStatus.pushCount,
					pullCount: trackingStatus.pullCount,
					hasUpstream: trackingStatus.hasUpstream,
					...(hasTruncation ? { truncated } : {}),
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
				assertRegisteredWorktree(input.worktreePath);

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
	againstBase: ChangedFile[];
	ahead: number;
	behind: number;
	truncatedAgainstBase: boolean;
}

async function getBranchComparison(
	git: SimpleGit,
	defaultBranch: string,
	maxAheadForDiff: number,
): Promise<BranchComparison> {
	let commits: GitChangesStatus["commits"] = [];
	let againstBase: ChangedFile[] = [];
	let truncatedAgainstBase = false;

	const { ahead, behind } = await getAheadBehind(git, defaultBranch);

	try {
		const logOutput = await git.raw([
			"log",
			`origin/${defaultBranch}..HEAD`,
			"--format=%H|%h|%s|%an|%aI",
		]);
		commits = parseGitLog(logOutput);

		if (ahead > 0 && ahead <= maxAheadForDiff) {
			const nameStatus = await git.raw([
				"diff",
				"--name-status",
				`origin/${defaultBranch}...HEAD`,
			]);
			againstBase = parseNameStatus(nameStatus);

			await applyNumstatToFiles(git, againstBase, [
				"diff",
				"--numstat",
				`origin/${defaultBranch}...HEAD`,
			]);
		} else if (ahead > maxAheadForDiff) {
			truncatedAgainstBase = true;
		}
	} catch {}

	return { commits, againstBase, ahead, behind, truncatedAgainstBase };
}

const MAX_LINE_COUNT_SIZE = 1 * 1024 * 1024;

async function applyUntrackedLineCount(
	worktreePath: string,
	untracked: ChangedFile[],
): Promise<void> {
	for (const file of untracked) {
		try {
			const stats = await secureFs.stat(worktreePath, file.path);
			if (stats.size > MAX_LINE_COUNT_SIZE) continue;

			const content = await secureFs.readFile(worktreePath, file.path);
			const lineCount = content.split("\n").length;
			file.additions = lineCount;
			file.deletions = 0;
		} catch {}
	}
}

interface TrackingStatus {
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
}

async function getTrackingBranchStatus(
	git: SimpleGit,
): Promise<TrackingStatus> {
	try {
		const upstream = await git.raw([
			"rev-parse",
			"--abbrev-ref",
			"@{upstream}",
		]);
		if (!upstream.trim()) {
			return { pushCount: 0, pullCount: 0, hasUpstream: false };
		}

		const tracking = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			"@{upstream}...HEAD",
		]);
		const [pullStr, pushStr] = tracking.trim().split(/\s+/);
		return {
			pushCount: Number.parseInt(pushStr || "0", 10),
			pullCount: Number.parseInt(pullStr || "0", 10),
			hasUpstream: true,
		};
	} catch {
		return { pushCount: 0, pullCount: 0, hasUpstream: false };
	}
}
