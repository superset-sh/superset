import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { parsePortelainStatus } from "../workspaces/utils/git";
import { assertRegisteredWorkspacePath, secureFs } from "./security";
import { applyNumstatToFiles } from "./utils/apply-numstat";
import type { GitRunner } from "./utils/git-runner";
import { resolveGitTarget } from "./utils/git-runner";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "./utils/parse-status";

/** Server-side cache to avoid re-running git commands when polled frequently */
const STATUS_CACHE_TTL_MS = 2_000;
const statusCache = new Map<
	string,
	{ result: GitChangesStatus; timestamp: number }
>();

/**
 * Run `git status --porcelain=v1 -b -z -uall` via the runner and parse
 * into the same shape parseGitStatus expects (StatusResult).
 */
async function getStatusViaRunner(runner: GitRunner) {
	const raw = await runner.raw([
		"--no-optional-locks",
		"status",
		"--porcelain=v1",
		"-b",
		"-z",
		"-uall",
	]);
	const statusResult = parsePortelainStatus(raw);
	return parseGitStatus(statusResult);
}

export const createStatusRouter = () => {
	return router({
		getStatus: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					defaultBranch: z.string().optional(),
					workspaceId: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<GitChangesStatus> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const defaultBranch = input.defaultBranch || "main";
				const cacheKey = `${input.workspaceId ?? ""}:${input.worktreePath}:${defaultBranch}`;
				const cached = statusCache.get(cacheKey);
				if (cached && Date.now() - cached.timestamp < STATUS_CACHE_TTL_MS) {
					return cached.result;
				}

				try {
					const target = resolveGitTarget(
						input.worktreePath,
						input.workspaceId,
					);
					const { runner } = target;

					const parsed = await getStatusViaRunner(runner);

					const [branchComparison, trackingStatus] = await Promise.all([
						getBranchComparison(runner, defaultBranch),
						getTrackingBranchStatus(runner),
						applyNumstatToFiles(runner, parsed.staged, [
							"diff",
							"--cached",
							"--numstat",
						]),
						applyNumstatToFiles(runner, parsed.unstaged, ["diff", "--numstat"]),
						applyUntrackedLineCount(
							input.worktreePath,
							parsed.untracked,
							runner,
						),
					]);

					const result: GitChangesStatus = {
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

					statusCache.set(cacheKey, { result, timestamp: Date.now() });
					return result;
				} catch (error) {
					console.error("[getStatus] Failed for", input.worktreePath, error);
					throw error;
				}
			}),

		getCommitFiles: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					commitHash: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.query(async ({ input }): Promise<ChangedFile[]> => {
				assertRegisteredWorkspacePath(input.worktreePath);

				const target = resolveGitTarget(input.worktreePath, input.workspaceId);
				const { runner } = target;

				const nameStatus = await runner.raw([
					"diff-tree",
					"--no-commit-id",
					"--name-status",
					"-r",
					input.commitHash,
				]);
				const files = parseNameStatus(nameStatus);

				await applyNumstatToFiles(runner, files, [
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
	runner: GitRunner,
	defaultBranch: string,
): Promise<BranchComparison> {
	let commits: GitChangesStatus["commits"] = [];
	let againstBase: ChangedFile[] = [];
	let ahead = 0;
	let behind = 0;

	try {
		const tracking = await runner.raw([
			"rev-list",
			"--left-right",
			"--count",
			`origin/${defaultBranch}...HEAD`,
		]);
		const [behindStr, aheadStr] = tracking.trim().split(/\s+/);
		behind = Number.parseInt(behindStr || "0", 10);
		ahead = Number.parseInt(aheadStr || "0", 10);

		const logOutput = await runner.raw([
			"log",
			`origin/${defaultBranch}..HEAD`,
			"--format=%H|%h|%s|%an|%aI",
		]);
		commits = parseGitLog(logOutput);

		if (ahead > 0) {
			const nameStatus = await runner.raw([
				"diff",
				"--name-status",
				`origin/${defaultBranch}...HEAD`,
			]);
			againstBase = parseNameStatus(nameStatus);

			await applyNumstatToFiles(runner, againstBase, [
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
	runner: GitRunner,
): Promise<void> {
	if (runner.isRemote) {
		// For remote: batch wc -l for all untracked files
		for (const file of untracked) {
			try {
				const result = await runner.exec(
					`wc -l < '${file.path.replace(/'/g, "'\\''")}'`,
				);
				if (result.code === 0) {
					const lineCount = Number.parseInt(result.stdout.trim(), 10);
					if (!Number.isNaN(lineCount)) {
						file.additions = lineCount;
						file.deletions = 0;
					}
				}
			} catch {}
		}
		return;
	}

	// Local path: use secureFs
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
	runner: GitRunner,
): Promise<TrackingStatus> {
	try {
		const upstream = await runner.raw([
			"rev-parse",
			"--abbrev-ref",
			"@{upstream}",
		]);
		if (!upstream.trim()) {
			return { pushCount: 0, pullCount: 0, hasUpstream: false };
		}

		const tracking = await runner.raw([
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
