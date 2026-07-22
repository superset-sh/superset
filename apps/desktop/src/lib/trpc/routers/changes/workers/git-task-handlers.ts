import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
	BINARY_SNIFF_BYTES,
	isBinaryMediaFile,
} from "@superset/shared/media-files";
import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import type { SimpleGit, StatusResult } from "simple-git";
import { getStatusNoLock } from "../../workspaces/utils/git";
import { getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";
import { applyNumstatToFiles } from "../utils/apply-numstat";
import { resolveEffectiveBaseBranch } from "../utils/git-base-branch";
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
	totalCommitCount: number;
	againstBase: ChangedFile[];
	ahead: number;
	behind: number;
}

export const MAX_COMMIT_LIST_COUNT = 500;

interface TrackingStatus {
	pushCount: number;
	pullCount: number;
	hasUpstream: boolean;
}

const MAX_LINE_COUNT_SIZE = 1 * 1024 * 1024;
// Chunk size for streaming untracked files when counting lines, so a file is
// never fully held in memory. Comfortably covers the binary sniff window.
const LINE_COUNT_CHUNK_SIZE = 64 * 1024;
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
			if (!stats.isFile()) continue;

			if (isBinaryMediaFile(file.path)) {
				file.isBinary = true;
				file.additions = 0;
				file.deletions = 0;
				continue;
			}

			// Stream in fixed chunks rather than slurping: readFile would pin
			// the whole file in memory and, decoded as utf-8, would turn binary
			// into U+FFFDs and report a bogus line count. Reuse one buffer,
			// sniff the first 8KB for NULs (git's binary heuristic), and tally
			// newlines as we go.
			const handle = await open(fileReal, "r");
			try {
				const buf = Buffer.allocUnsafe(LINE_COUNT_CHUNK_SIZE);
				let { bytesRead } = await handle.read(buf, 0, buf.length, 0);

				const sniffEnd = Math.min(bytesRead, BINARY_SNIFF_BYTES);
				let isBinary = false;
				for (let i = 0; i < sniffEnd; i++) {
					if (buf[i] === 0) {
						isBinary = true;
						break;
					}
				}
				if (isBinary) {
					file.isBinary = true;
					file.additions = 0;
					file.deletions = 0;
					continue;
				}

				// Over the budget: skip the LOC signal without reading the rest.
				if (stats.size > MAX_LINE_COUNT_SIZE) continue;

				let newlines = 0;
				let lastByte = -1;
				let offset = 0;
				while (bytesRead > 0) {
					for (let i = 0; i < bytesRead; i++) {
						if (buf[i] === 0x0a) newlines++;
					}
					lastByte = buf[bytesRead - 1] ?? lastByte;
					offset += bytesRead;
					({ bytesRead } = await handle.read(buf, 0, buf.length, offset));
				}
				// Match `content.split(/\r?\n/)`: a trailing newline doesn't add
				// a line, but a final non-empty line without one does. (\r\n
				// shares the \n, so counting \n bytes is equivalent.)
				file.additions =
					lastByte === -1 ? 0 : lastByte === 0x0a ? newlines : newlines + 1;
				file.deletions = 0;
			} finally {
				await handle.close();
			}
		} catch (error) {
			logWorkerDebug(
				`failed untracked line count for "${file.path}" in "${worktreePath}"`,
				error,
			);
		}
	}
}

async function getBranchComparison(
	git: SimpleGit,
	defaultBranch: string,
): Promise<BranchComparison> {
	let commits: GitChangesStatus["commits"] = [];
	let totalCommitCount = 0;
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
			`--max-count=${MAX_COMMIT_LIST_COUNT}`,
			"--format=%H|%h|%s|%an|%aI",
		]);
		commits = parseGitLog(logOutput);
		totalCommitCount = ahead;

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

	return { commits, totalCommitCount, againstBase, ahead, behind };
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
	} catch (error) {
		logWorkerDebug("failed to compute tracking branch status", error);
		return { pushCount: 0, pullCount: 0, hasUpstream: false };
	}
}

async function computeStatus({
	worktreePath,
	defaultBranch,
	persistedWorktree,
}: GitTaskPayloadMap["getStatus"]): Promise<GitChangesStatus> {
	const git = await getSimpleGitWithShellPath(worktreePath);

	const status: StatusResult = await getStatusNoLock(worktreePath);
	const parsed = parseGitStatus(status);
	const effectiveBaseBranch =
		defaultBranch ||
		(await resolveEffectiveBaseBranch({
			git,
			currentBranch: parsed.branch === "HEAD" ? null : parsed.branch,
			persistedWorktree,
		}));

	const [branchComparison, trackingStatus] = await Promise.all([
		getBranchComparison(git, effectiveBaseBranch),
		getTrackingBranchStatus(git),
		applyNumstatToFiles(git, parsed.staged, ["diff", "--cached", "--numstat"]),
		applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]),
		applyUntrackedLineCount(worktreePath, parsed.untracked),
	]);

	return {
		branch: parsed.branch,
		defaultBranch: effectiveBaseBranch,
		againstBase: branchComparison.againstBase,
		commits: branchComparison.commits,
		totalCommitCount: branchComparison.totalCommitCount,
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
	const git = await getSimpleGitWithShellPath(worktreePath);

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
