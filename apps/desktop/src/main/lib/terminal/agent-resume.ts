import type { Dirent } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, join, normalize } from "node:path";
import { type ParseEntry, parse } from "shell-quote";

const MAX_RECENT_TRANSCRIPT_FILES = 200;
const MAX_SNIPPET_BYTES = 64 * 1024;
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SAFE_SHELL_TOKEN = /^[A-Za-z0-9_@%+=:,./~$-]+$/;
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type SupportedAgentId = "claude" | "codex";

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

function normalizeAgentExecutableName(
	value: string | null | undefined,
): SupportedAgentId | null {
	if (!value) return null;
	return isSupportedAgentId(basename(value).toLowerCase())
		? (basename(value).toLowerCase() as SupportedAgentId)
		: null;
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
	originalCommand?: string | null,
): string {
	const rebuiltFromOriginal = buildResumeCommandFromOriginalLaunch({
		agentId,
		sessionId,
		originalCommand,
	});
	if (rebuiltFromOriginal) {
		return rebuiltFromOriginal;
	}

	switch (agentId) {
		case "claude":
			return `claude --resume ${sessionId}`;
		case "codex":
			return `codex resume ${sessionId}`;
	}
}

function quoteShellToken(value: string): string {
	if (value === "") return "''";
	if (SAFE_SHELL_TOKEN.test(value)) return value;
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function splitLeadingEnvAssignments(tokens: string[]): {
	env: Record<string, string>;
	rest: string[];
} {
	const env: Record<string, string> = {};
	let firstCommandIndex = 0;

	for (const token of tokens) {
		const equalsIndex = token.indexOf("=");
		const key = token.slice(0, equalsIndex);
		if (equalsIndex <= 0 || !ENV_KEY.test(key)) {
			break;
		}

		env[key] = token.slice(equalsIndex + 1);
		firstCommandIndex += 1;
	}

	return { env, rest: tokens.slice(firstCommandIndex) };
}

function joinEnvAssignments(env: Record<string, string>): string {
	return Object.entries(env)
		.filter(([key]) => ENV_KEY.test(key))
		.map(([key, value]) => `${key}=${quoteShellToken(value)}`)
		.join(" ");
}

function joinCommandArgs(command: string, args: string[]): string {
	const tokens = command.length === 0 ? args : [command, ...args];
	if (tokens.length === 0) return "";
	return tokens.map(quoteShellToken).join(" ");
}

function joinCommandArgsWithEnv(
	command: string,
	args: string[],
	env: Record<string, string>,
): string {
	const envPrefix = joinEnvAssignments(env);
	const commandText = joinCommandArgs(command, args);
	if (!envPrefix) return commandText;
	if (!commandText) return envPrefix;
	return `${envPrefix} ${commandText}`;
}

function parseShellPreservingEnvRefs(input: string): ParseEntry[] {
	return parse(input, (key) => `$${key}`);
}

function isControlOperatorToken(
	token: ParseEntry,
): token is Extract<ParseEntry, { op: unknown }> {
	return typeof token === "object" && token !== null && "op" in token;
}

function splitShellCommandSegments(
	tokens: ParseEntry[],
): Array<{ tokens: string[]; operatorAfter?: string }> | null {
	const segments: Array<{ tokens: string[]; operatorAfter?: string }> = [];
	let current: string[] = [];

	for (const token of tokens) {
		if (typeof token === "string") {
			current.push(token);
			continue;
		}

		if (!isControlOperatorToken(token) || token.op === "glob") {
			return null;
		}

		if (current.length === 0) {
			return null;
		}

		segments.push({ tokens: current, operatorAfter: token.op });
		current = [];
	}

	if (current.length > 0) {
		segments.push({ tokens: current });
	}

	return segments.length > 0 ? segments : null;
}

function parseCommandSegment(tokens: string[]): {
	command: string;
	args: string[];
	env: Record<string, string>;
} | null {
	const { env, rest } = splitLeadingEnvAssignments(tokens);
	if (rest.length === 0) {
		return null;
	}

	const [command, ...args] = rest;
	if (!command) {
		return null;
	}

	return { command, args, env };
}

function isCdSegment(segment: { tokens: string[] }): boolean {
	const parsed = parseCommandSegment(segment.tokens);
	return basename(parsed?.command ?? "") === "cd";
}

function parseLaunchCommandString(input: string): {
	command: string;
	args: string[];
	env: Record<string, string>;
} | null {
	const parsedTokens = parseShellPreservingEnvRefs(input);
	const segments = splitShellCommandSegments(parsedTokens);
	if (!segments) return null;

	if (segments.length === 1) {
		return parseCommandSegment(segments[0].tokens);
	}

	if (
		segments.length === 2 &&
		segments[0].operatorAfter === "&&" &&
		isCdSegment(segments[0])
	) {
		return parseCommandSegment(segments[1].tokens);
	}

	return null;
}

export function inferSupportedAgentIdFromLaunchCommand(
	command: string | null | undefined,
): SupportedAgentId | null {
	if (typeof command !== "string" || !command.trim()) {
		return null;
	}

	try {
		const parsed = parseLaunchCommandString(command);
		return normalizeAgentExecutableName(parsed?.command);
	} catch {
		return null;
	}
}

function buildResumeCommandFromOriginalLaunch(params: {
	agentId: SupportedAgentId;
	sessionId: string;
	originalCommand?: string | null;
}): string | null {
	if (!params.originalCommand?.trim()) {
		return null;
	}

	let parsed: ReturnType<typeof parseLaunchCommandString>;
	try {
		parsed = parseLaunchCommandString(params.originalCommand);
	} catch {
		return null;
	}
	if (!parsed) {
		return null;
	}
	if (normalizeAgentExecutableName(parsed.command) !== params.agentId) {
		return null;
	}

	const originalArgs = removeExistingResumeArgs(params.agentId, parsed.args);
	const args =
		params.agentId === "claude"
			? [...originalArgs, "--resume", params.sessionId]
			: [...originalArgs, "resume", params.sessionId];

	return joinCommandArgsWithEnv(parsed.command, args, parsed.env);
}

function removeExistingResumeArgs(
	agentId: SupportedAgentId,
	args: string[],
): string[] {
	if (agentId === "claude") {
		const withoutResume: string[] = [];
		for (let index = 0; index < args.length; index += 1) {
			const arg = args[index];
			if (arg?.startsWith("--resume=")) {
				const sessionId = arg.slice("--resume=".length);
				if (SESSION_ID_PATTERN.test(sessionId)) {
					continue;
				}
			}
			if (
				arg === "--resume" &&
				index + 1 < args.length &&
				SESSION_ID_PATTERN.test(args[index + 1] ?? "")
			) {
				index += 1;
				continue;
			}
			withoutResume.push(arg);
		}
		return withoutResume;
	}

	const resumeIndex = args.findIndex(
		(arg, index) =>
			arg === "resume" &&
			index + 1 < args.length &&
			SESSION_ID_PATTERN.test(args[index + 1] ?? ""),
	);
	if (resumeIndex === -1) {
		return args;
	}

	return [...args.slice(0, resumeIndex), ...args.slice(resumeIndex + 2)];
}

async function findClaudeTopLevelTranscriptPath(
	sessionId: string,
): Promise<string | null> {
	const targetFileName = `${sessionId}.jsonl`;
	return findTranscriptPathInTree({
		rootDir: join(getCurrentHomeDir(), ".claude", "projects"),
		shouldSkipDirectory: (entry) => entry.name === "subagents",
		matchesFile: async (entry, fullPath) =>
			entry.isFile() && entry.name === targetFileName ? fullPath : null,
	});
}

export async function hasClaudeTopLevelTranscript(
	sessionId: string,
): Promise<boolean> {
	return (await findClaudeTopLevelTranscriptPath(sessionId)) !== null;
}

async function findCodexTranscriptPath(
	sessionId: string,
): Promise<string | null> {
	const targetSuffix = `${sessionId}.jsonl`;
	return findTranscriptPathInTree({
		rootDir: join(getCurrentHomeDir(), ".codex", "sessions"),
		matchesFile: async (entry, fullPath) => {
			if (!entry.isFile() || !entry.name.endsWith(targetSuffix)) {
				return null;
			}

			const snippet = await readSnippet(fullPath);
			if (!snippet) {
				return null;
			}

			const parsed = parseCodexSnippet(snippet);
			if (!parsed) {
				return null;
			}

			const normalizedSessionId = normalizeSessionId(
				parsed.sessionId,
				fullPath,
			);
			return normalizedSessionId === sessionId ? fullPath : null;
		},
	});
}

async function hasCodexTranscript(sessionId: string): Promise<boolean> {
	return (await findCodexTranscriptPath(sessionId)) !== null;
}

async function findTranscriptPathInTree(params: {
	rootDir: string;
	shouldSkipDirectory?: (entry: Dirent) => boolean;
	matchesFile: (entry: Dirent, fullPath: string) => Promise<string | null>;
}): Promise<string | null> {
	const pendingDirs = [params.rootDir];

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
				if (params.shouldSkipDirectory?.(entry)) {
					continue;
				}
				pendingDirs.push(fullPath);
				continue;
			}

			const matchedPath = await params.matchesFile(entry, fullPath);
			if (matchedPath) {
				return matchedPath;
			}
		}
	}

	return null;
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
		await handle?.close().catch((error) => {
			logResumeWarning(`Failed to close transcript snippet ${path}`, error);
		});
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
	originalCommand?: string | null;
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
			resumeCommand: buildResumeCommand(
				params.agentId,
				normalizedSessionId,
				params.originalCommand,
			),
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
	originalCommand?: string | null;
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
		const hasStoredTranscript =
			normalizedAgentId === "claude"
				? await hasClaudeTopLevelTranscript(normalizedSessionId)
				: await hasCodexTranscript(normalizedSessionId);
		if (!hasStoredTranscript) {
			logResumeWarning(
				`Stored ${normalizedAgentId} session ${normalizedSessionId} has no transcript; falling back to transcript scan`,
			);
		} else {
			return {
				agentId: normalizedAgentId,
				sessionId: normalizedSessionId,
				resumeCommand: buildResumeCommand(
					normalizedAgentId,
					normalizedSessionId,
					params.originalCommand,
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
		originalCommand: params.originalCommand,
	});
}
