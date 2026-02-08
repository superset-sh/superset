import { close, open, read } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const fsOpen = promisify(open);
const fsRead = promisify(read);
const fsClose = promisify(close);

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Max bytes to read from the start of each JSONL file (metadata is in the first ~2 lines). */
const HEAD_BYTES = 4096;

/** How many files to stat concurrently per batch. */
const BATCH_SIZE = 100;

export interface ClaudeSessionInfo {
	sessionId: string;
	project: string;
	cwd: string;
	gitBranch: string | null;
	display: string;
	timestamp: number;
}

export interface ClaudeSessionPage {
	sessions: ClaudeSessionInfo[];
	nextCursor: number | null;
	total: number;
}

interface SessionFileEntry {
	filePath: string;
	projectDir: string;
	sessionId: string;
	mtime: number;
}

/** Cached index of session files sorted by mtime desc. Built once, reused for pagination. */
let cachedIndex: SessionFileEntry[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60_000; // 5 minutes

function decodeProjectDir(encoded: string): string {
	return encoded.replace(/-/g, "/");
}

async function readSessionMeta(filePath: string): Promise<{
	sessionId: string;
	cwd: string;
	gitBranch: string | null;
	display: string;
	timestamp: number;
} | null> {
	let fd: number | undefined;
	try {
		fd = await fsOpen(filePath, "r");
		const buffer = Buffer.alloc(HEAD_BYTES);
		const { bytesRead } = await fsRead(fd, buffer, 0, HEAD_BYTES, 0);
		await fsClose(fd);
		fd = undefined;

		const head = buffer.toString("utf-8", 0, bytesRead);
		const lines = head.split("\n");

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line);
				if (parsed.type === "user" && parsed.sessionId) {
					return {
						sessionId: parsed.sessionId,
						cwd: parsed.cwd ?? "",
						gitBranch: parsed.gitBranch ?? null,
						display:
							typeof parsed.message?.content === "string"
								? parsed.message.content.slice(0, 200)
								: "",
						timestamp: parsed.timestamp
							? new Date(parsed.timestamp).getTime()
							: 0,
					};
				}
			} catch {
				// Incomplete JSON at buffer boundary or non-JSON line
			}
		}
		return null;
	} catch {
		if (fd !== undefined) {
			try {
				await fsClose(fd);
			} catch {
				// ignore
			}
		}
		return null;
	}
}

/**
 * Build an index of all session files with their mtimes.
 * Uses stat (no file reads) so it's fast even for 600+ files.
 */
async function buildIndex(): Promise<SessionFileEntry[]> {
	if (cachedIndex && Date.now() - cacheTimestamp < CACHE_TTL) {
		return cachedIndex;
	}

	const projectsDir = join(homedir(), ".claude", "projects");

	let projectDirs: string[];
	try {
		projectDirs = await readdir(projectsDir);
	} catch {
		return [];
	}

	const entries: SessionFileEntry[] = [];

	// Collect all session files with their mtimes
	for (let i = 0; i < projectDirs.length; i += BATCH_SIZE) {
		const batch = projectDirs.slice(i, i + BATCH_SIZE);
		await Promise.all(
			batch.map(async (projectDir) => {
				const fullProjectDir = join(projectsDir, projectDir);
				try {
					const files = await readdir(fullProjectDir);
					const sessionFiles = files.filter(
						(f) =>
							f.endsWith(".jsonl") && UUID_RE.test(f.replace(".jsonl", "")),
					);

					await Promise.all(
						sessionFiles.map(async (f) => {
							const filePath = join(fullProjectDir, f);
							try {
								const s = await stat(filePath);
								entries.push({
									filePath,
									projectDir,
									sessionId: f.replace(".jsonl", ""),
									mtime: s.mtimeMs,
								});
							} catch {
								// skip
							}
						}),
					);
				} catch {
					// skip
				}
			}),
		);

		// Yield between batches
		if (i + BATCH_SIZE < projectDirs.length) {
			await new Promise<void>((resolve) => setImmediate(resolve));
		}
	}

	// Deduplicate by sessionId — keep most recent mtime
	const seen = new Map<string, SessionFileEntry>();
	for (const entry of entries) {
		const existing = seen.get(entry.sessionId);
		if (!existing || entry.mtime > existing.mtime) {
			seen.set(entry.sessionId, entry);
		}
	}

	const deduplicated = Array.from(seen.values());
	deduplicated.sort((a, b) => b.mtime - a.mtime);

	cachedIndex = deduplicated;
	cacheTimestamp = Date.now();
	return deduplicated;
}

/**
 * Scans ~/.claude/projects/ for resumable Claude Code sessions with cursor-based pagination.
 * First call builds a lightweight index using stat (no file reads).
 * Then reads metadata only for the requested page.
 */
export async function scanClaudeSessions({
	cursor = 0,
	limit = 30,
}: {
	cursor?: number;
	limit?: number;
}): Promise<ClaudeSessionPage> {
	const index = await buildIndex();
	const page = index.slice(cursor, cursor + limit);

	// Read metadata only for this page
	const sessions: ClaudeSessionInfo[] = [];
	await Promise.all(
		page.map(async (entry) => {
			const meta = await readSessionMeta(entry.filePath);
			if (meta) {
				sessions.push({
					...meta,
					project: decodeProjectDir(entry.projectDir),
				});
			}
		}),
	);

	// Re-sort this page by timestamp from the actual metadata
	sessions.sort((a, b) => b.timestamp - a.timestamp);

	const nextOffset = cursor + limit;
	return {
		sessions,
		nextCursor: nextOffset < index.length ? nextOffset : null,
		total: index.length,
	};
}

/**
 * Find the JSONL file path for a Claude Code session by ID.
 * Returns null if the session is not found in the index.
 */
export async function findSessionFilePath({
	sessionId,
}: {
	sessionId: string;
}): Promise<string | null> {
	const index = await buildIndex();
	return index.find((e) => e.sessionId === sessionId)?.filePath ?? null;
}
