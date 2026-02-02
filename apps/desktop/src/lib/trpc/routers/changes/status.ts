import type {
	ChangedFile,
	GitChangesStatus,
	MultiRepoGitChangesStatus,
	NestedRepoStatus,
} from "shared/changes-types";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getStatusNoLock } from "../workspaces/utils/git";
import {
	assertRegisteredWorktree,
	assertValidNestedRepo,
	secureFs,
} from "./security";
import { applyNumstatToFiles } from "./utils/apply-numstat";
import { detectNestedRepos, getRepoDisplayName } from "./utils/nested-repos";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "./utils/parse-status";

/**
 * Get git status for a single repository path.
 * Internal helper used by both getStatus and getMultiRepoStatus.
 *
 * @param worktreePath - The registered parent worktree (for security validation)
 * @param repoPath - The target repo path (may be nested or same as worktreePath)
 * @param defaultBranch - The default branch name for comparison
 */
async function getRepoStatus({
	worktreePath,
	repoPath,
	defaultBranch,
}: {
	worktreePath: string;
	repoPath: string;
	defaultBranch: string;
}): Promise<GitChangesStatus> {
	const git = simpleGit(repoPath);

	// First, get status (needed for subsequent operations)
	// Use --no-optional-locks to avoid holding locks on the repository
	const status = await getStatusNoLock(repoPath);
	const parsed = parseGitStatus(status);

	// Run independent operations in parallel
	const [branchComparison, trackingStatus] = await Promise.all([
		getBranchComparison(git, defaultBranch),
		getTrackingBranchStatus(git),
		applyNumstatToFiles(git, parsed.staged, ["diff", "--cached", "--numstat"]),
		applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]),
		applyUntrackedLineCount({
			worktreePath,
			repoPath,
			untracked: parsed.untracked,
		}),
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

export const createStatusRouter = () => {
	return router({
		getStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					defaultBranch: z.string().optional(),
					repoPath: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				assertRegisteredWorktree(input.worktreePath);

				// If repoPath provided, validate it's within worktree bounds
				const targetPath = input.repoPath || input.worktreePath;
				if (input.repoPath) {
					assertValidNestedRepo(input.worktreePath, input.repoPath);
				}

				const defaultBranch = input.defaultBranch || "main";
				return getRepoStatus({
					worktreePath: input.worktreePath,
					repoPath: targetPath,
					defaultBranch,
				});
			}),

		getMultiRepoStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					defaultBranch: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<MultiRepoGitChangesStatus> => {
				assertRegisteredWorktree(input.worktreePath);

				const defaultBranch = input.defaultBranch || "main";

				// Detect all nested repos
				const repoPaths = await detectNestedRepos(input.worktreePath);

				// If no repos found, return empty state
				if (repoPaths.length === 0) {
					return {
						repos: [],
						totalStaged: 0,
						totalUnstaged: 0,
						totalUntracked: 0,
					};
				}

				// Fetch status for all repos in parallel
				const repoStatuses = await Promise.all(
					repoPaths.map(async (repoPath): Promise<NestedRepoStatus> => {
						const status = await getRepoStatus({
							worktreePath: input.worktreePath,
							repoPath,
							defaultBranch,
						});
						return {
							...status,
							repoPath,
							repoName: getRepoDisplayName(input.worktreePath, repoPath),
							isRoot: repoPath === input.worktreePath,
						};
					}),
				);

				// Calculate totals
				const totalStaged = repoStatuses.reduce(
					(sum, repo) => sum + repo.staged.length,
					0,
				);
				const totalUnstaged = repoStatuses.reduce(
					(sum, repo) => sum + repo.unstaged.length,
					0,
				);
				const totalUntracked = repoStatuses.reduce(
					(sum, repo) => sum + repo.untracked.length,
					0,
				);

				return {
					repos: repoStatuses,
					totalStaged,
					totalUnstaged,
					totalUntracked,
				};
			}),

		getCommitFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
					repoPath: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<ChangedFile[]> => {
				assertRegisteredWorktree(input.worktreePath);

				const targetPath = input.repoPath || input.worktreePath;
				if (input.repoPath) {
					assertValidNestedRepo(input.worktreePath, input.repoPath);
				}

				const git = simpleGit(targetPath);

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

/** Max file size for line counting (1 MiB) - skip larger files to avoid OOM */
const MAX_LINE_COUNT_SIZE = 1 * 1024 * 1024;

async function applyUntrackedLineCount({
	worktreePath,
	repoPath,
	untracked,
}: {
	/** The registered parent worktree (for security validation) */
	worktreePath: string;
	/** The target repo path (may be nested or same as worktreePath) */
	repoPath: string;
	untracked: ChangedFile[];
}): Promise<void> {
	for (const file of untracked) {
		try {
			// Use nested-repo-aware methods for proper security validation
			const stats = await secureFs.statInNestedRepo(
				worktreePath,
				repoPath,
				file.path,
			);
			if (stats.size > MAX_LINE_COUNT_SIZE) continue;

			const content = await secureFs.readFileInNestedRepo(
				worktreePath,
				repoPath,
				file.path,
			);
			const lineCount = content.split("\n").length;
			file.additions = lineCount;
			file.deletions = 0;
		} catch {
			// Skip files that fail validation or reading
		}
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
