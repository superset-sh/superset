import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import type { StatusResult } from "simple-git";
import simpleGit from "simple-git";
import { getStatusNoLock } from "../../workspaces/utils/git";
import { applyNumstatToFiles } from "../utils/apply-numstat";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "../utils/parse-status";
import type {
	GitTaskPayloadMap,
	GitTaskResultMap,
	GitTaskType,
} from "./git-task-types";

interface BranchComparison {
	commits: GitChangesStatus["commits"];
	againstBase: ChangedFile[];
	ahead: number;
	behind: number;
}

interface TrackingStatus {
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
}

const MAX_LINE_COUNT_SIZE = 1 * 1024 * 1024;
const WORKER_DEBUG = process.env.SUPERSET_WORKER_DEBUG === "1";

function logWorkerWarning(message: string, error: unknown): void {
	console.warn(`[changes-git-worker] ${message}`, error);
}

function logWorkerDebug(message: string, error: unknown): void {
	if (!WORKER_DEBUG) return;
	logWorkerWarning(message, error);
}

function isPathWithinWorktree(
	worktreePath: string,
	candidate: string,
): boolean {
	const relativePath = relative(worktreePath, candidate);
	if (relativePath === "") return true;
	return (
		relativePath !== ".." &&
		!relativePath.startsWith(`..${sep}`) &&
		!isAbsolute(relativePath)
	);
}

function resolvePathInWorktree(
	worktreePath: string,
	filePath: string,
): string | null {
	const absolutePath = resolve(worktreePath, filePath);
	if (!isPathWithinWorktree(worktreePath, absolutePath)) {
		return null;
	}
	return absolutePath;
}

async function applyUntrackedLineCount(
	worktreePath: string,
	untracked: ChangedFile[],
): Promise<void> {
	let worktreeReal: string;
	try {
		worktreeReal = await realpath(worktreePath);
	} catch (error) {
		logWorkerWarning(
			`failed to resolve worktree realpath for line counting: ${worktreePath}`,
			error,
		);
		return;
	}

	for (const file of untracked) {
		try {
			const absolutePath = resolvePathInWorktree(worktreePath, file.path);
			if (!absolutePath) continue;

			const fileReal = await realpath(absolutePath);
			if (!isPathWithinWorktree(worktreeReal, fileReal)) continue;

			const stats = await stat(fileReal);
			if (!stats.isFile() || stats.size > MAX_LINE_COUNT_SIZE) continue;

			const content = await readFile(fileReal, "utf-8");
			const lineCount =
				content === ""
					? 0
					: content.endsWith("\n")
						? content.split(/\r?\n/).length - 1
						: content.split(/\r?\n/).length;
			file.additions = lineCount;
			file.deletions = 0;
		} catch (error) {
			logWorkerDebug(
				`failed untracked line count for "${file.path}" in "${worktreePath}"`,
				error,
			);
		}
	}
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
	} catch (error) {
		logWorkerDebug(
			`failed to compute branch comparison against ${defaultBranch}`,
			error,
		);
	}

	return { commits, againstBase, ahead, behind };
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
	} catch (error) {
		logWorkerDebug("failed to compute tracking branch status", error);
		return { pushCount: 0, pullCount: 0, hasUpstream: false };
	}
}

async function computeStatus({
	worktreePath,
	defaultBranch,
}: GitTaskPayloadMap["getStatus"]): Promise<GitChangesStatus> {
	const git = simpleGit(worktreePath);

	const status: StatusResult = await getStatusNoLock(worktreePath);
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

async function computeCommitFiles({
	worktreePath,
	commitHash,
}: GitTaskPayloadMap["getCommitFiles"]): Promise<ChangedFile[]> {
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

export async function executeGitTask<TTask extends GitTaskType>(
	taskType: TTask,
	payload: GitTaskPayloadMap[TTask],
): Promise<GitTaskResultMap[TTask]> {
	switch (taskType) {
		case "getStatus":
			return computeStatus(
				payload as GitTaskPayloadMap["getStatus"],
			) as Promise<GitTaskResultMap[TTask]>;
		case "getCommitFiles":
			return computeCommitFiles(
				payload as GitTaskPayloadMap["getCommitFiles"],
			) as Promise<GitTaskResultMap[TTask]>;
		default: {
			const exhaustive: never = taskType;
			throw new Error(`Unknown git task: ${exhaustive}`);
		}
	}
}
