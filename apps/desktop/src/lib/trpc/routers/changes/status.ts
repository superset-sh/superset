import { projects, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull, not } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
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

				const git = simpleGit(input.worktreePath);
				const defaultBranch = input.defaultBranch || "main";

				// First, get status (needed for subsequent operations)
				// Use --no-optional-locks to avoid holding locks on the repository
				const status = await getStatusNoLock(input.worktreePath);
				const parsed = parseGitStatus(status);
				syncWorkspaceBranch({
					worktreePath: input.worktreePath,
					currentBranch: parsed.branch,
				});

				// Run independent operations in parallel
				const [branchComparison, trackingStatus] = await Promise.all([
					getBranchComparison(git, defaultBranch),
					getTrackingBranchStatus(git),
					applyNumstatToFiles(git, parsed.staged, [
						"diff",
						"--cached",
						"--numstat",
					]),
					applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]),
					applyUntrackedLineCount(input.worktreePath, parsed.untracked),
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

/**
 * Update local DB branch fields to match the current git branch for a worktree
 * or main repo workspace path.
 */
function syncWorkspaceBranch({
	worktreePath,
	currentBranch,
}: {
	worktreePath: string;
	currentBranch: string;
}): void {
	if (!currentBranch || currentBranch === "HEAD") {
		return;
	}

	try {
		const worktree = localDb
			.select({ id: worktrees.id })
			.from(worktrees)
			.where(eq(worktrees.path, worktreePath))
			.get();

		if (worktree) {
			localDb
				.update(worktrees)
				.set({ branch: currentBranch })
				.where(
					and(
						eq(worktrees.id, worktree.id),
						not(eq(worktrees.branch, currentBranch)),
					),
				)
				.run();

			localDb
				.update(workspaces)
				.set({ branch: currentBranch })
				.where(
					and(
						eq(workspaces.worktreeId, worktree.id),
						isNull(workspaces.deletingAt),
						not(eq(workspaces.branch, currentBranch)),
					),
				)
				.run();

			return;
		}

		const project = localDb
			.select({ id: projects.id })
			.from(projects)
			.where(eq(projects.mainRepoPath, worktreePath))
			.get();
		if (!project) {
			return;
		}

		localDb
			.update(workspaces)
			.set({ branch: currentBranch })
			.where(
				and(
					eq(workspaces.projectId, project.id),
					eq(workspaces.type, "branch"),
					isNull(workspaces.deletingAt),
					not(eq(workspaces.branch, currentBranch)),
				),
			)
			.run();
	} catch (error) {
		console.warn("[changes/status] Failed to sync branch:", error);
	}
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

/** Max file size for line counting (1 MiB) - skip larger files to avoid OOM */
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
