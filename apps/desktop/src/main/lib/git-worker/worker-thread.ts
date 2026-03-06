/**
 * Git Worker Thread
 *
 * Runs in a Node.js worker_thread. Receives git task requests via parentPort,
 * executes them, and posts results back. This keeps heavy git reads
 * off the Electron main thread.
 *
 * IMPORTANT: This file must NOT import any Electron modules.
 * It runs as a standalone Node.js worker thread.
 */

import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { parentPort } from "node:worker_threads";
import type { FileStatus } from "shared/changes-types";
import simpleGit from "simple-git";
import type {
	GitTaskPayloads,
	GitTaskResults,
	WorkerRequest,
	WorkerResponse,
} from "./types";

const execFileAsync = promisify(execFile);

if (!parentPort) {
	throw new Error("git-worker must be run as a worker_thread");
}

const port = parentPort;

// ---------------------------------------------------------------------------
// Task handlers
// ---------------------------------------------------------------------------

type TaskHandler<T extends keyof GitTaskPayloads> = (
	payload: GitTaskPayloads[T],
) => Promise<GitTaskResults[T]>;

const handlers: {
	[K in keyof GitTaskPayloads]: TaskHandler<K>;
} = {
	getStatus: handleGetStatus,
	getCommitFiles: handleGetCommitFiles,
};

// ---------------------------------------------------------------------------
// Message loop
// ---------------------------------------------------------------------------

port.on("message", async (msg: WorkerRequest) => {
	const start = performance.now();
	try {
		const handler = handlers[msg.taskType];
		// Cast is safe: taskType is discriminated
		const result = await (handler as TaskHandler<typeof msg.taskType>)(
			msg.payload,
		);
		const response: WorkerResponse = {
			id: msg.id,
			ok: true,
			result,
			durationMs: performance.now() - start,
		};
		port.postMessage(response);
	} catch (err) {
		const response: WorkerResponse = {
			id: msg.id,
			ok: false,
			error: err instanceof Error ? err.message : String(err),
			code: getErrorCode(err),
			durationMs: performance.now() - start,
		};
		port.postMessage(response);
	}
});

function getErrorCode(err: unknown): string | undefined {
	if (err instanceof Error && "code" in err) {
		return String((err as Error & { code: unknown }).code);
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// getStatus handler
// ---------------------------------------------------------------------------

interface ExecFileException extends Error {
	code?: number | string;
	stderr?: string;
}

function isExecFileException(error: unknown): error is ExecFileException {
	return (
		error instanceof Error &&
		("code" in error || "signal" in error || "killed" in error)
	);
}

class NotGitRepoError extends Error {
	constructor(repoPath: string) {
		super(`Not a git repository: ${repoPath}`);
		this.name = "NotGitRepoError";
	}
}

async function getStatusNoLock(
	repoPath: string,
): Promise<ReturnType<typeof parsePortelainStatus>> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			[
				"--no-optional-locks",
				"-C",
				repoPath,
				"status",
				"--porcelain=v1",
				"-b",
				"-z",
				"-uall",
			],
			{ timeout: 30_000 },
		);
		return parsePortelainStatus(stdout);
	} catch (error) {
		if (isExecFileException(error)) {
			if (error.code === "ENOENT") {
				throw new Error("Git is not installed or not found in PATH");
			}
			const stderr = error.stderr || error.message || "";
			if (stderr.includes("not a git repository")) {
				throw new NotGitRepoError(repoPath);
			}
		}
		throw new Error(
			`Failed to get git status: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

// Inline porcelain parser (same logic as workspaces/utils/git.ts)
interface StatusResultCompat {
	files: Array<{
		path: string;
		from: string;
		index: string;
		working_dir: string;
	}>;
	current: string | null;
	tracking: string | null;
	detached: boolean;
}

function parsePortelainStatus(stdout: string): StatusResultCompat {
	const entries = stdout.split("\0").filter(Boolean);

	let current: string | null = null;
	let tracking: string | null = null;
	let isDetached = false;

	const files: StatusResultCompat["files"] = [];

	let i = 0;
	while (i < entries.length) {
		const entry = entries[i];
		if (!entry) {
			i++;
			continue;
		}

		if (entry.startsWith("## ")) {
			const branchInfo = entry.slice(3);
			if (branchInfo.startsWith("HEAD (no branch)") || branchInfo === "HEAD") {
				isDetached = true;
				current = "HEAD";
			} else if (
				branchInfo.startsWith("No commits yet on ") ||
				branchInfo.startsWith("Initial commit on ")
			) {
				const parts = branchInfo.split(" ");
				current = parts[parts.length - 1] || null;
			} else {
				const trackingMatch = branchInfo.match(/^(.+?)\.\.\.(.+?)(?:\s|$)/);
				if (trackingMatch) {
					current = trackingMatch[1] ?? null;
					tracking = trackingMatch[2]?.split(" ")[0] ?? null;
				} else {
					current = branchInfo.split(" ")[0] || null;
				}
			}
			i++;
			continue;
		}

		if (entry.length < 3) {
			i++;
			continue;
		}

		const indexStatus = entry[0] as string;
		const workingStatus = entry[1] as string;
		const path = entry.slice(3);
		let from: string | undefined;

		if (indexStatus === "R" || indexStatus === "C") {
			i++;
			from = entries[i];
		}

		files.push({
			path,
			from: from ?? path,
			index: indexStatus,
			working_dir: workingStatus,
		});

		i++;
	}

	return { files, current, tracking, detached: isDetached };
}

// Parse status into categorized files
interface ParsedStatus {
	branch: string;
	staged: ChangedFileData[];
	unstaged: ChangedFileData[];
	untracked: ChangedFileData[];
}

interface ChangedFileData {
	path: string;
	oldPath?: string;
	status: FileStatus;
	additions: number;
	deletions: number;
}

function parseGitStatusResult(status: StatusResultCompat): ParsedStatus {
	const staged: ChangedFileData[] = [];
	const unstaged: ChangedFileData[] = [];
	const untracked: ChangedFileData[] = [];

	for (const file of status.files) {
		const path = file.path;
		const index = file.index;
		const working = file.working_dir;

		if (index === "?" && working === "?") {
			untracked.push({
				path,
				status: "untracked",
				additions: 0,
				deletions: 0,
			});
			continue;
		}

		if (index && index !== " " && index !== "?") {
			staged.push({
				path,
				oldPath: file.path !== file.from ? file.from : undefined,
				status: mapGitStatus(index, " "),
				additions: 0,
				deletions: 0,
			});
		}

		if (working && working !== " " && working !== "?") {
			unstaged.push({
				path,
				status: mapGitStatus(" ", working),
				additions: 0,
				deletions: 0,
			});
		}
	}

	return {
		branch: status.current || "HEAD",
		staged,
		unstaged,
		untracked,
	};
}

function mapGitStatus(gitIndex: string, gitWorking: string): FileStatus {
	if (gitIndex === "A" || gitWorking === "A") return "added";
	if (gitIndex === "D" || gitWorking === "D") return "deleted";
	if (gitIndex === "R") return "renamed";
	if (gitIndex === "C") return "copied";
	if (gitIndex === "?" || gitWorking === "?") return "untracked";
	return "modified";
}

// Numstat helpers
function parseDiffNumstat(
	numstatOutput: string,
): Map<string, { additions: number; deletions: number }> {
	const stats = new Map<string, { additions: number; deletions: number }>();

	for (const line of numstatOutput.trim().split("\n")) {
		if (!line.trim()) continue;
		const [addStr, delStr, ...pathParts] = line.split("\t");
		const rawPath = pathParts.join("\t");
		if (!rawPath) continue;

		const additions =
			addStr === "-" ? 0 : Number.parseInt(addStr ?? "0", 10) || 0;
		const deletions =
			delStr === "-" ? 0 : Number.parseInt(delStr ?? "0", 10) || 0;
		const statEntry = { additions, deletions };

		const renameMatch = rawPath.match(/^(.+) => (.+)$/);
		if (renameMatch?.[1] && renameMatch[2]) {
			stats.set(renameMatch[2], statEntry);
			stats.set(renameMatch[1], statEntry);
		} else {
			stats.set(rawPath, statEntry);
		}
	}

	return stats;
}

async function applyNumstatToFiles(
	git: ReturnType<typeof simpleGit>,
	files: ChangedFileData[],
	diffArgs: string[],
): Promise<void> {
	if (files.length === 0) return;
	try {
		const numstat = await git.raw(diffArgs);
		const stats = parseDiffNumstat(numstat);
		for (const file of files) {
			const fileStat = stats.get(file.path);
			if (fileStat) {
				file.additions = fileStat.additions;
				file.deletions = fileStat.deletions;
			}
		}
	} catch {}
}

// Git log parser
interface CommitInfoData {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: string; // ISO string — Date is not transferable across worker boundary
	files: ChangedFileData[];
}

function parseGitLog(logOutput: string): CommitInfoData[] {
	if (!logOutput.trim()) return [];

	const commits: CommitInfoData[] = [];
	const lines = logOutput.trim().split("\n");

	for (const line of lines) {
		if (!line.trim()) continue;
		const parts = line.split("|");
		if (parts.length < 5) continue;

		const hash = parts[0]?.trim();
		const shortHash = parts[1]?.trim();
		const message = parts.slice(2, -2).join("|").trim();
		const author = parts[parts.length - 2]?.trim();
		const dateStr = parts[parts.length - 1]?.trim();

		if (!hash || !shortHash) continue;

		let dateIso: string;
		if (dateStr) {
			const parsed = new Date(dateStr);
			dateIso = Number.isNaN(parsed.getTime())
				? new Date().toISOString()
				: parsed.toISOString();
		} else {
			dateIso = new Date().toISOString();
		}

		commits.push({
			hash,
			shortHash,
			message: message || "",
			author: author || "",
			date: dateIso,
			files: [],
		});
	}

	return commits;
}

function parseNameStatus(nameStatusOutput: string): ChangedFileData[] {
	const files: ChangedFileData[] = [];

	for (const line of nameStatusOutput.trim().split("\n")) {
		if (!line.trim()) continue;
		const parts = line.split("\t");
		const statusCode = parts[0];
		if (!statusCode) continue;

		const isRenameOrCopy =
			statusCode.startsWith("R") || statusCode.startsWith("C");
		const path = isRenameOrCopy ? parts[2] : parts[1];
		const oldPath = isRenameOrCopy ? parts[1] : undefined;

		if (!path) continue;

		let status: FileStatus;
		switch (statusCode[0]) {
			case "A":
				status = "added";
				break;
			case "D":
				status = "deleted";
				break;
			case "R":
				status = "renamed";
				break;
			case "C":
				status = "copied";
				break;
			default:
				status = "modified";
		}

		files.push({ path, oldPath, status, additions: 0, deletions: 0 });
	}

	return files;
}

// ---------------------------------------------------------------------------
// getStatus — full implementation
// ---------------------------------------------------------------------------

const MAX_LINE_COUNT_SIZE = 1 * 1024 * 1024;

async function applyUntrackedLineCount(
	worktreePath: string,
	untracked: ChangedFileData[],
): Promise<void> {
	for (const file of untracked) {
		try {
			const filePath = join(worktreePath, file.path);
			const stats = await stat(filePath);
			if (stats.size > MAX_LINE_COUNT_SIZE) continue;

			const content = await readFile(filePath, "utf-8");
			file.additions = content.split("\n").length;
			file.deletions = 0;
		} catch {}
	}
}

interface BranchComparisonData {
	commits: CommitInfoData[];
	againstBase: ChangedFileData[];
	ahead: number;
	behind: number;
}

async function getBranchComparison(
	git: ReturnType<typeof simpleGit>,
	defaultBranch: string,
): Promise<BranchComparisonData> {
	let commits: CommitInfoData[] = [];
	let againstBase: ChangedFileData[] = [];
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

async function getTrackingBranchStatus(
	git: ReturnType<typeof simpleGit>,
): Promise<{ pushCount: number; pullCount: number; hasUpstream: boolean }> {
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

async function handleGetStatus(
	payload: GitTaskPayloads["getStatus"],
): Promise<GitTaskResults["getStatus"]> {
	const { worktreePath, defaultBranch } = payload;

	const git = simpleGit(worktreePath);

	const statusResult = await getStatusNoLock(worktreePath);
	const parsed = parseGitStatusResult(statusResult);

	const [branchComparison, trackingStatus] = await Promise.all([
		getBranchComparison(git, defaultBranch),
		getTrackingBranchStatus(git),
		applyNumstatToFiles(git, parsed.staged, ["diff", "--cached", "--numstat"]),
		applyNumstatToFiles(git, parsed.unstaged, ["diff", "--numstat"]),
		applyUntrackedLineCount(worktreePath, parsed.untracked),
	]);

	// Convert CommitInfoData (ISO strings) to CommitInfo (Date objects)
	// Note: Dates are serialized as ISO strings across the worker boundary,
	// and SuperJSON in tRPC will handle Date serialization to the client.
	const commits = branchComparison.commits.map((c) => ({
		...c,
		date: new Date(c.date),
	}));

	return {
		branch: parsed.branch,
		defaultBranch,
		againstBase:
			branchComparison.againstBase as GitTaskResults["getStatus"]["againstBase"],
		commits,
		staged: parsed.staged as GitTaskResults["getStatus"]["staged"],
		unstaged: parsed.unstaged as GitTaskResults["getStatus"]["unstaged"],
		untracked: parsed.untracked as GitTaskResults["getStatus"]["untracked"],
		ahead: branchComparison.ahead,
		behind: branchComparison.behind,
		pushCount: trackingStatus.pushCount,
		pullCount: trackingStatus.pullCount,
		hasUpstream: trackingStatus.hasUpstream,
	};
}

// ---------------------------------------------------------------------------
// getCommitFiles handler
// ---------------------------------------------------------------------------

async function handleGetCommitFiles(
	payload: GitTaskPayloads["getCommitFiles"],
): Promise<GitTaskResults["getCommitFiles"]> {
	const { worktreePath, commitHash } = payload;
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

	return files as GitTaskResults["getCommitFiles"];
}
