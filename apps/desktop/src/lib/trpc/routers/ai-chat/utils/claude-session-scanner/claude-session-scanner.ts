import { close, createReadStream, open, read } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
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

// ============================================================================
// Message Reading
// ============================================================================

export interface ClaudeSessionMessagePart {
	type: string;
	content?: string;
	id?: string;
	name?: string;
	arguments?: Record<string, unknown>;
	state?: string;
	toolCallId?: string;
	error?: string;
}

export interface ClaudeSessionMessage {
	id: string;
	role: "user" | "assistant";
	parts: ClaudeSessionMessagePart[];
}

function convertContentBlock(
	block: Record<string, unknown>,
): ClaudeSessionMessagePart | null {
	switch (block.type) {
		case "text":
			return { type: "text", content: block.text as string };
		case "thinking":
			return { type: "thinking", content: block.thinking as string };
		case "tool_use":
			return {
				type: "tool-call",
				id: block.id as string,
				name: block.name as string,
				arguments: (block.input as Record<string, unknown>) ?? {},
				state: "complete",
			};
		case "tool_result": {
			const raw = block.content;
			const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
			return {
				type: "tool-result",
				toolCallId: block.tool_use_id as string,
				content,
				state: "complete",
			};
		}
		default:
			return null;
	}
}

/**
 * Reads all user/assistant messages from a Claude Code session JSONL file
 * and returns them in UIMessage-compatible format.
 *
 * Tool results from user turns are merged into the preceding assistant message
 * so that tool-call and tool-result parts are co-located for rendering.
 */
export async function readClaudeSessionMessages({
	sessionId,
}: {
	sessionId: string;
}): Promise<ClaudeSessionMessage[]> {
	const index = await buildIndex();
	const entry = index.find((e) => e.sessionId === sessionId);
	if (!entry) return [];

	const messages: ClaudeSessionMessage[] = [];
	let messageCounter = 0;

	try {
		const rl = createInterface({
			input: createReadStream(entry.filePath, { encoding: "utf-8" }),
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		for await (const line of rl) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line);
				const msgId = parsed.uuid ?? `cc-msg-${++messageCounter}`;

				if (parsed.type === "user" && parsed.message) {
					const content = parsed.message.content;

					if (typeof content === "string") {
						messages.push({
							id: msgId,
							role: "user",
							parts: [{ type: "text", content }],
						});
					} else if (Array.isArray(content)) {
						const toolResultParts: ClaudeSessionMessagePart[] = [];
						const otherParts: ClaudeSessionMessagePart[] = [];

						for (const block of content) {
							const part = convertContentBlock(
								block as Record<string, unknown>,
							);
							if (!part) continue;
							if (part.type === "tool-result") {
								toolResultParts.push(part);
							} else {
								otherParts.push(part);
							}
						}

						// Merge tool results into the last assistant message
						if (toolResultParts.length > 0 && messages.length > 0) {
							const lastMsg = messages[messages.length - 1];
							if (lastMsg && lastMsg.role === "assistant") {
								lastMsg.parts.push(...toolResultParts);
							}
						}

						// Add remaining parts as user message
						if (otherParts.length > 0) {
							messages.push({
								id: msgId,
								role: "user",
								parts: otherParts,
							});
						}
					}
				} else if (parsed.type === "assistant" && parsed.message) {
					const content = parsed.message.content;
					const parts: ClaudeSessionMessagePart[] = [];

					if (Array.isArray(content)) {
						for (const block of content) {
							const part = convertContentBlock(
								block as Record<string, unknown>,
							);
							if (part) parts.push(part);
						}
					} else if (typeof content === "string") {
						parts.push({ type: "text", content });
					}

					if (parts.length > 0) {
						messages.push({
							id: msgId,
							role: "assistant",
							parts,
						});
					}
				}
			} catch {
				// Skip unparseable lines
			}
		}
	} catch {
		return [];
	}

	return messages;
}
