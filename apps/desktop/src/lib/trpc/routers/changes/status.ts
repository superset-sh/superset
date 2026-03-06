import { TRPCError } from "@trpc/server";
import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import type { StatusResult } from "simple-git";
import simpleGit from "simple-git";
import { z } from "zod";
import {
	isGitWorkerEnabled,
	submitGetCommitFiles,
	submitGetStatus,
} from "../../../../main/lib/git-worker";
import { publicProcedure, router } from "../..";
import { getStatusNoLock, NotGitRepoError } from "../workspaces/utils/git";
import { assertRegisteredWorktree, secureFs } from "./security";
import { applyNumstatToFiles } from "./utils/apply-numstat";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "./utils/parse-status";
import {
	clearInFlightStatus,
	getCachedStatus,
	getInFlightStatus,
	makeStatusCacheKey,
	setCachedStatus,
	setInFlightStatus,
} from "./utils/status-cache";

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
				assertRegisteredWorktree(input.worktreePath);

				const defaultBranch = input.defaultBranch || "main";
				const cacheKey = makeStatusCacheKey(input.worktreePath, defaultBranch);
				const cached = getCachedStatus(cacheKey);
				if (cached) {
					return cached;
				}

				const inFlight = getInFlightStatus(cacheKey);
				if (inFlight) {
					return inFlight;
				}

				let statusPromise!: Promise<GitChangesStatus>;
				statusPromise = (async (): Promise<GitChangesStatus> => {
					if (isGitWorkerEnabled()) {
						return await getStatusViaWorker(input.worktreePath, defaultBranch);
					}
					return await getStatusMainThread(input.worktreePath, defaultBranch);
				})();

				setInFlightStatus(cacheKey, statusPromise);
				try {
					const result = await statusPromise;

					// Guard against stale in-flight completion after explicit invalidation.
					if (getInFlightStatus(cacheKey) === statusPromise) {
						setCachedStatus(cacheKey, result);
					}
					return result;
				} finally {
					if (getInFlightStatus(cacheKey) === statusPromise) {
						clearInFlightStatus(cacheKey);
					}
				}
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

				if (isGitWorkerEnabled()) {
					return await getCommitFilesViaWorker(
						input.worktreePath,
						input.commitHash,
					);
				}
				return await getCommitFilesMainThread(
					input.worktreePath,
					input.commitHash,
				);
			}),
	});
};

// ---------------------------------------------------------------------------
// Worker-based implementations
// ---------------------------------------------------------------------------

async function getStatusViaWorker(
	worktreePath: string,
	defaultBranch: string,
): Promise<GitChangesStatus> {
	try {
		return await submitGetStatus({ worktreePath, defaultBranch });
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes("Not a git repository")) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: msg,
			});
		}
		throw error;
	}
}

async function getCommitFilesViaWorker(
	worktreePath: string,
	commitHash: string,
): Promise<ChangedFile[]> {
	return await submitGetCommitFiles({ worktreePath, commitHash });
}

// ---------------------------------------------------------------------------
// Main-thread fallback implementations (SUPERSET_GIT_WORKER=0)
// ---------------------------------------------------------------------------

async function getStatusMainThread(
	worktreePath: string,
	defaultBranch: string,
): Promise<GitChangesStatus> {
	const git = simpleGit(worktreePath);

	let status: StatusResult;
	try {
		status = await getStatusNoLock(worktreePath);
	} catch (error) {
		if (error instanceof NotGitRepoError) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: error.message,
			});
		}
		throw error;
	}
	const parsed = parseGitStatus(status);

	const [branchComparison, trackingStatus] = await Promise.all([
		getBranchComparison(git, defaultBranch),
		getTrackingBranchStatus(git),
		applyNumstatToFiles(git, parsed.staged, ["diff", "--cached", "--numstat"]),
		applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]),
		applyUntrackedLineCount(worktreePath, parsed.untracked),
	]);

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
	};
}

async function getCommitFilesMainThread(
	worktreePath: string,
	commitHash: string,
): Promise<ChangedFile[]> {
	const git = simpleGit(worktreePath);

	const nameStatus = await git.raw([
		"diff-tree",
		"--no-commit-id",
		"--name-status",
		"-r",
		commitHash,
	]);
	const files = parseNameStatus(nameStatus);

	await applyNumstatToFiles(git, files, [
		"diff-tree",
		"--no-commit-id",
		"--numstat",
		"-r",
		commitHash,
	]);

	return files;
}

interface BranchComparison {
	commits: GitChangesStatus["commits"];
	againstBase: ChangedFile[];
	ahead: number;
	behind: number;
}

async function getBranchComparison(
	git: ReturnType<typeof simpleGit>,
	defaultBranch: string,
): Promise<BranchComparison> {
	let commits: GitChangesStatus["commits"] = [];
	let againstBase: ChangedFile[] = [];
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
			againstBase = parseNameStatus(nameStatus);

			await applyNumstatToFiles(git, againstBase, [
				"diff",
				"--numstat",
				`origin/${defaultBranch}...HEAD`,
			]);
		}
	} catch {}

	return { commits, againstBase, ahead, behind };
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
	git: ReturnType<typeof simpleGit>,
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
