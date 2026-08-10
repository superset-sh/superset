import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
	BINARY_SNIFF_BYTES,
	isBinaryMediaFile,
} from "@superset/shared/media-files";
import type { ChangedFile, GitChangesStatus } from "shared/changes-types";
import type { SimpleGit, StatusResult } from "simple-git";
import { getBranchBaseConfig } from "../../workspaces/utils/base-branch-config";
import {
	getAheadBehindCount,
	getCurrentBranch,
	getStatusNoLock,
} from "../../workspaces/utils/git";
import { getSimpleGitWithShellPath } from "../../workspaces/utils/git-client";
import { applyNumstatToFiles } from "../utils/apply-numstat";
import {
	getDefaultBranch,
	resolveEffectiveBaseBranch,
} from "../utils/git-base-branch";
import {
	parseGitLog,
	parseGitStatus,
	parseNameStatus,
} from "../utils/parse-status";
import { selectEffectiveBaseBranch } from "../utils/select-effective-base-branch";
import type {
	GitBranchesResult,
	GitFileVersions,
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

async function getLocalBranchesWithDates(
	git: SimpleGit,
	localBranches: string[],
): Promise<Array<{ branch: string; lastCommitDate: number }>> {
	try {
		const branchInfo = await git.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname:short) %(committerdate:unix)",
			"refs/heads/",
		]);

		const local: Array<{ branch: string; lastCommitDate: number }> = [];
		for (const line of branchInfo.trim().split("\n")) {
			if (!line) continue;
			const lastSpaceIdx = line.lastIndexOf(" ");
			const branch = line.substring(0, lastSpaceIdx);
			const timestamp = Number.parseInt(line.substring(lastSpaceIdx + 1), 10);
			if (localBranches.includes(branch)) {
				local.push({
					branch,
					lastCommitDate: timestamp * 1000,
				});
			}
		}
		return local;
	} catch (error) {
		console.warn("[git-task] branch dates unavailable, sorting degraded", {
			error,
		});
		return localBranches.map((branch) => ({ branch, lastCommitDate: 0 }));
	}
}

async function getCheckedOutBranches(
	git: SimpleGit,
	currentWorktreePath: string,
): Promise<Record<string, string>> {
	const checkedOutBranches: Record<string, string> = {};

	try {
		const worktreeList = await git.raw(["worktree", "list", "--porcelain"]);
		const lines = worktreeList.split("\n");
		let currentPath: string | null = null;

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				currentPath = line.substring(9).trim();
			} else if (line.startsWith("branch ")) {
				const branch = line.substring(7).trim().replace("refs/heads/", "");
				if (currentPath && currentPath !== currentWorktreePath) {
					checkedOutBranches[branch] = currentPath;
				}
			}
		}
	} catch (error) {
		console.warn("[git-task] worktree list failed, checked-out map empty", {
			error,
		});
	}

	return checkedOutBranches;
}

async function computeBranches({
	worktreePath,
	persistedWorktree,
}: GitTaskPayloadMap["getBranches"]): Promise<GitBranchesResult> {
	const git = await getSimpleGitWithShellPath(worktreePath);

	const branchSummary = await git.branch(["-a"]);
	const currentBranch = await getCurrentBranch(worktreePath);
	const { compareBaseBranch } = currentBranch
		? await getBranchBaseConfig({
				repoPath: worktreePath,
				branch: currentBranch,
			})
		: { compareBaseBranch: null };
	const worktreeBaseBranch = selectEffectiveBaseBranch({
		configuredBaseBranch: compareBaseBranch,
		persistedWorktree,
		currentBranch,
		defaultBranch: null,
	});

	const localBranches: string[] = [];
	const remote: string[] = [];

	for (const name of Object.keys(branchSummary.branches)) {
		if (name.startsWith("remotes/origin/")) {
			if (name === "remotes/origin/HEAD") continue;
			const remoteName = name.replace("remotes/origin/", "");
			remote.push(remoteName);
		} else {
			localBranches.push(name);
		}
	}

	const local = await getLocalBranchesWithDates(git, localBranches);
	const defaultBranch = await getDefaultBranch(git, remote);
	const checkedOutBranches = await getCheckedOutBranches(git, worktreePath);

	return {
		local,
		remote: remote.sort(),
		defaultBranch,
		checkedOutBranches,
		worktreeBaseBranch,
		currentBranch,
	};
}

const MAX_FILE_SIZE = 2 * 1024 * 1024;

async function safeGitShow(
	git: SimpleGit,
	spec: string,
): Promise<string | null> {
	try {
		// Guard against memory spikes from large blobs in git history
		try {
			const sizeOutput = await git.raw(["cat-file", "-s", spec]);
			const blobSize = Number.parseInt(sizeOutput.trim(), 10);
			if (!Number.isNaN(blobSize) && blobSize > MAX_FILE_SIZE) {
				return `[File content truncated - exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit]`;
			}
		} catch {}

		const content = await git.show([spec]);
		return content;
	} catch {
		return null;
	}
}

async function computeFileContents(
	payload: GitTaskPayloadMap["getFileContents"],
): Promise<GitFileVersions> {
	const git = await getSimpleGitWithShellPath(payload.worktreePath);

	switch (payload.category) {
		case "against-base": {
			const [original, modified] = await Promise.all([
				safeGitShow(
					git,
					`origin/${payload.defaultBranch}:${payload.originalPath}`,
				),
				safeGitShow(git, `HEAD:${payload.filePath}`),
			]);
			return { original, modified };
		}
		case "committed": {
			const [original, modified] = await Promise.all([
				safeGitShow(git, `${payload.commitHash}^:${payload.originalPath}`),
				safeGitShow(git, `${payload.commitHash}:${payload.filePath}`),
			]);
			return { original, modified };
		}
		case "staged": {
			const [original, modified] = await Promise.all([
				safeGitShow(git, `HEAD:${payload.originalPath}`),
				safeGitShow(git, `:0:${payload.filePath}`),
			]);
			return { original, modified };
		}
		case "original": {
			// Sequential on purpose: skip the HEAD lookup when a staged blob exists.
			const modified = await safeGitShow(git, `:0:${payload.originalPath}`);
			if (modified !== null) return { original: null, modified };
			const original = await safeGitShow(git, `HEAD:${payload.originalPath}`);
			return { original, modified: null };
		}
	}
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
		case "getBranches":
			return computeBranches(
				payload as GitTaskPayloadMap["getBranches"],
			) as Promise<GitTaskResultMap[TTask]>;
		case "getAheadBehind":
			return getAheadBehindCount(
				payload as GitTaskPayloadMap["getAheadBehind"],
			) as Promise<GitTaskResultMap[TTask]>;
		case "getFileContents":
			return computeFileContents(
				payload as GitTaskPayloadMap["getFileContents"],
			) as Promise<GitTaskResultMap[TTask]>;
		default: {
			const exhaustive: never = taskType;
			throw new Error(`Unknown git task: ${exhaustive}`);
		}
	}
}
