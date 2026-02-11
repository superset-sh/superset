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

/** Session metadata lives in the first ~2 JSONL lines, so 4KB is plenty. */
const HEAD_BYTES = 4096;

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

let cachedIndex: SessionFileEntry[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60_000;

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
				// JSON may be truncated at buffer boundary
			}
		}
		return null;
	} catch (err) {
		console.debug(
			`[claude-scanner] Failed to read session meta:`,
			filePath,
			err,
		);
		if (fd !== undefined) {
			try {
				await fsClose(fd);
			} catch (closeErr) {
				console.debug(`[claude-scanner] Failed to close fd:`, closeErr);
			}
		}
		return null;
	}
}

async function buildIndex(): Promise<SessionFileEntry[]> {
	if (cachedIndex && Date.now() - cacheTimestamp < CACHE_TTL) {
		return cachedIndex;
	}

	const projectsDir = join(homedir(), ".claude", "projects");

	let projectDirs: string[];
	try {
		projectDirs = await readdir(projectsDir);
	} catch (err) {
		console.debug(
			`[claude-scanner] Cannot read projects dir:`,
			projectsDir,
			err,
		);
		return [];
	}

	const entries: SessionFileEntry[] = [];

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
							} catch (err) {
								console.debug(`[claude-scanner] stat failed:`, filePath, err);
							}
						}),
					);
				} catch (err) {
					console.debug(
						`[claude-scanner] readdir failed:`,
						fullProjectDir,
						err,
					);
				}
			}),
		);

		if (i + BATCH_SIZE < projectDirs.length) {
			await new Promise<void>((resolve) => setImmediate(resolve));
		}
	}

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

export async function scanClaudeSessions({
	cursor = 0,
	limit = 30,
}: {
	cursor?: number;
	limit?: number;
}): Promise<ClaudeSessionPage> {
	const index = await buildIndex();
	const page = index.slice(cursor, cursor + limit);

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

	// Index is sorted by mtime, but actual timestamps from metadata may differ
	sessions.sort((a, b) => b.timestamp - a.timestamp);

	const nextOffset = cursor + limit;
	return {
		sessions,
		nextCursor: nextOffset < index.length ? nextOffset : null,
		total: index.length,
	};
}

export async function findSessionFilePath({
	sessionId,
}: {
	sessionId: string;
}): Promise<string | null> {
	const index = await buildIndex();
	return index.find((e) => e.sessionId === sessionId)?.filePath ?? null;
}
