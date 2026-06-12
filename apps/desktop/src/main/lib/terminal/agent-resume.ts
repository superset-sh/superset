import type { Dirent } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, normalize } from "node:path";

const MAX_RECENT_TRANSCRIPT_FILES = 200;
const MAX_SNIPPET_BYTES = 64 * 1024;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

type SupportedAgentId = "claude" | "codex";

export interface AgentResumeTarget {
	agentId: SupportedAgentId;
	sessionId: string;
	resumeCommand: string;
	sourcePath: string;
}

interface TranscriptCandidate extends AgentResumeTarget {
	cwd: string;
	mtimeMs: number;
	matchScore: number;
}

function normalizePath(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const normalized = normalize(trimmed).replaceAll("\\", "/");
	if (normalized === "/" || /^[A-Za-z]:\/$/.test(normalized)) {
		return normalized;
	}
	return normalized.replace(/\/+$/, "");
}

function logResumeWarning(message: string, error?: unknown): void {
	if (error === undefined) {
		console.warn(`[agent-resume] ${message}`);
		return;
	}
	console.warn(`[agent-resume] ${message}`, error);
}

function isErrnoException(
	error: unknown,
	code: string,
): error is NodeJS.ErrnoException {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === code
	);
}

function normalizeSessionId(
	value: string | null | undefined,
	context?: string,
): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (!SESSION_ID_PATTERN.test(trimmed)) {
		logResumeWarning(
			`Ignoring invalid session id${context ? ` from ${context}` : ""}`,
		);
		return null;
	}
	return trimmed;
}

function getCurrentHomeDir(): string {
	const homeFromEnv = process.env.HOME?.trim();
	return homeFromEnv || homedir();
}

function uniqueNonEmptyPaths(
	values: Array<string | null | undefined>,
): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const value of values) {
		const normalized = normalizePath(value);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
	}

	return result;
}

function isPathAncestorOrSame(parent: string, child: string): boolean {
	if (child === parent) {
		return true;
	}
	const prefix = parent.endsWith("/") ? parent : `${parent}/`;
	return child.startsWith(prefix);
}

function isSupportedAgentId(
	value: string | null | undefined,
): value is SupportedAgentId {
	return value === "claude" || value === "codex";
}

function scoreCandidateCwd(
	candidateCwd: string,
	searchPaths: string[],
): number {
	let bestScore = 0;

	for (const searchPath of searchPaths) {
		if (candidateCwd === searchPath) {
			bestScore = Math.max(bestScore, 300);
			continue;
		}

		if (
			isPathAncestorOrSame(candidateCwd, searchPath) ||
			isPathAncestorOrSame(searchPath, candidateCwd)
		) {
			bestScore = Math.max(bestScore, 200);
		}
	}

	return bestScore;
}

function buildResumeCommand(
	agentId: SupportedAgentId,
	sessionId: string,
): string {
	switch (agentId) {
		case "claude":
			return `claude --resume ${sessionId}`;
		case "codex":
			return `codex resume ${sessionId}`;
	}
}

async function findClaudeTopLevelTranscriptPath(
	sessionId: string,
): Promise<string | null> {
	const rootDir = join(getCurrentHomeDir(), ".claude", "projects");
	const targetFileName = `${sessionId}.jsonl`;
	const pendingDirs = [rootDir];

	while (pendingDirs.length > 0) {
		const dir = pendingDirs.pop();
		if (!dir) {
			continue;
		}

		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (error) {
			if (!isErrnoException(error, "ENOENT")) {
				logResumeWarning(`Failed to read transcript directory ${dir}`, error);
			}
			continue;
		}

		for (const entry of entries) {
			const fullPath = join(dir, entry.name);

			if (entry.isDirectory()) {
				if (entry.name === "subagents") {
					continue;
				}
				pendingDirs.push(fullPath);
				continue;
			}

			if (entry.isFile() && entry.name === targetFileName) {
				return fullPath;
			}
		}
	}

	return null;
}

export async function hasClaudeTopLevelTranscript(
	sessionId: string,
): Promise<boolean> {
	return (await findClaudeTopLevelTranscriptPath(sessionId)) !== null;
}

async function collectRecentFiles(
	rootDir: string,
	matchesFile: (path: string) => boolean,
): Promise<Array<{ path: string; mtimeMs: number }>> {
	const files: Array<{ path: string; mtimeMs: number }> = [];

	const pushFile = (path: string, mtimeMs: number) => {
		files.push({ path, mtimeMs });
	};

	const visit = async (dir: string): Promise<void> => {
		let entries: Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch (error) {
			if (!isErrnoException(error, "ENOENT")) {
				logResumeWarning(`Failed to read transcript directory ${dir}`, error);
			}
			return;
		}

		await Promise.all(
			entries.map(async (entry) => {
				const fullPath = join(dir, entry.name);

				if (entry.isDirectory()) {
					if (entry.name === "subagents") return;
					await visit(fullPath);
					return;
				}

				if (!entry.isFile() || !matchesFile(fullPath)) {
					return;
				}

				try {
					const stats = await fs.stat(fullPath);
					pushFile(fullPath, stats.mtimeMs);
				} catch (error) {
					logResumeWarning(`Failed to stat transcript file ${fullPath}`, error);
				}
			}),
		);
	};

	await visit(rootDir);
	files.sort((a, b) => b.mtimeMs - a.mtimeMs);
	if (files.length > MAX_RECENT_TRANSCRIPT_FILES) {
		files.length = MAX_RECENT_TRANSCRIPT_FILES;
	}
	return files;
}

async function readSnippet(path: string): Promise<string | null> {
	let handle: fs.FileHandle | null = null;

	try {
		handle = await fs.open(path, "r");
		const buffer = Buffer.alloc(MAX_SNIPPET_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		return buffer.subarray(0, bytesRead).toString("utf8");
	} catch (error) {
		logResumeWarning(`Failed to read transcript snippet ${path}`, error);
		return null;
	} finally {
		await handle?.close().catch(() => {});
	}
}

function parseClaudeSnippet(
	snippet: string,
): Pick<TranscriptCandidate, "cwd" | "sessionId"> | null {
	for (const line of snippet.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{")) continue;

		try {
			const parsed = JSON.parse(trimmed) as {
				cwd?: unknown;
				sessionId?: unknown;
			};
			if (
				typeof parsed.cwd === "string" &&
				parsed.cwd &&
				typeof parsed.sessionId === "string" &&
				parsed.sessionId
			) {
				return {
					cwd: parsed.cwd,
					sessionId: parsed.sessionId,
				};
			}
		} catch {
			// Keep scanning - transcript snippets may be truncated mid-line.
		}
	}

	return null;
}

function parseCodexSnippet(
	snippet: string,
): Pick<TranscriptCandidate, "cwd" | "sessionId"> | null {
	const firstLine = snippet.split("\n", 1)[0]?.trim();
	if (!firstLine?.startsWith("{")) {
		return null;
	}

	try {
		const parsed = JSON.parse(firstLine) as {
			type?: unknown;
			payload?: {
				id?: unknown;
				cwd?: unknown;
			};
		};
		if (
			parsed.type !== "session_meta" ||
			typeof parsed.payload?.id !== "string" ||
			!parsed.payload.id ||
			typeof parsed.payload.cwd !== "string" ||
			!parsed.payload.cwd
		) {
			return null;
		}

		return {
			cwd: parsed.payload.cwd,
			sessionId: parsed.payload.id,
		};
	} catch {
		return null;
	}
}

async function resolveCandidateFromTranscripts(params: {
	agentId: SupportedAgentId;
	searchPaths: string[];
}): Promise<TranscriptCandidate | null> {
	const rootDir =
		params.agentId === "claude"
			? join(getCurrentHomeDir(), ".claude", "projects")
			: join(getCurrentHomeDir(), ".codex", "sessions");
	const files = await collectRecentFiles(rootDir, (path) =>
		params.agentId === "claude"
			? path.endsWith(".jsonl")
			: path.endsWith(".jsonl") && path.includes("rollout-"),
	);

	let bestCandidate: TranscriptCandidate | null = null;

	for (const file of files) {
		const snippet = await readSnippet(file.path);
		if (!snippet) continue;

		const parsed =
			params.agentId === "claude"
				? parseClaudeSnippet(snippet)
				: parseCodexSnippet(snippet);
		if (!parsed) continue;

		const normalizedCwd = normalizePath(parsed.cwd);
		if (!normalizedCwd) continue;
		const normalizedSessionId = normalizeSessionId(parsed.sessionId, file.path);
		if (!normalizedSessionId) continue;

		const matchScore = scoreCandidateCwd(normalizedCwd, params.searchPaths);
		if (matchScore === 0) continue;

		const candidate: TranscriptCandidate = {
			agentId: params.agentId,
			sessionId: normalizedSessionId,
			resumeCommand: buildResumeCommand(params.agentId, normalizedSessionId),
			sourcePath: file.path,
			cwd: normalizedCwd,
			mtimeMs: file.mtimeMs,
			matchScore,
		};

		if (
			!bestCandidate ||
			candidate.matchScore > bestCandidate.matchScore ||
			(candidate.matchScore === bestCandidate.matchScore &&
				candidate.mtimeMs > bestCandidate.mtimeMs)
		) {
			bestCandidate = candidate;
		}
	}

	return bestCandidate;
}

export async function resolveAgentResumeTarget(params: {
	agentId?: string | null;
	sessionId?: string | null;
	cwd?: string | null;
	workspacePath?: string | null;
	rootPath?: string | null;
}): Promise<AgentResumeTarget | null> {
	const searchPaths = uniqueNonEmptyPaths([
		params.cwd,
		params.workspacePath,
		params.rootPath,
	]);
	const normalizedAgentId = isSupportedAgentId(params.agentId)
		? params.agentId
		: null;
	const normalizedSessionId = normalizeSessionId(
		params.sessionId,
		"session-location-log",
	);

	if (normalizedAgentId && normalizedSessionId) {
		if (
			normalizedAgentId === "claude" &&
			!(await hasClaudeTopLevelTranscript(normalizedSessionId))
		) {
			logResumeWarning(
				`Stored Claude session ${normalizedSessionId} has no top-level transcript; falling back to transcript scan`,
			);
		} else {
			return {
				agentId: normalizedAgentId,
				sessionId: normalizedSessionId,
				resumeCommand: buildResumeCommand(
					normalizedAgentId,
					normalizedSessionId,
				),
				sourcePath: "session-location-log",
			};
		}
	}

	if (searchPaths.length === 0) {
		return null;
	}

	if (!normalizedAgentId) {
		return null;
	}

	return resolveCandidateFromTranscripts({
		agentId: normalizedAgentId,
		searchPaths,
	});
}
