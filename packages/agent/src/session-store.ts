import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SESSION_MAX_SIZE = 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface SessionEntry {
	claudeSessionId: string;
	lastAccessedAt: number;
}

const claudeSessions = new Map<string, SessionEntry>();

let sessionsDir: string | null = null;
let sessionsFile: string | null = null;

export function initSessionStore(dataDir: string): void {
	sessionsDir = dataDir;
	sessionsFile = join(dataDir, "claude-sessions.json");
	loadPersistedSessions();
}

function loadPersistedSessions(): void {
	if (!sessionsFile) return;

	try {
		if (existsSync(sessionsFile)) {
			const raw = readFileSync(sessionsFile, "utf-8");
			const entries = JSON.parse(raw) as Array<[string, SessionEntry]>;
			for (const [key, entry] of entries) {
				claudeSessions.set(key, entry);
			}
			console.log(
				`[agent/session-store] Loaded ${entries.length} persisted sessions`,
			);
		}
	} catch (err) {
		console.warn(
			"[agent/session-store] Failed to load persisted sessions:",
			err,
		);
	}
}

function persistSessions(): void {
	if (!sessionsDir || !sessionsFile) return;

	try {
		if (!existsSync(sessionsDir)) {
			mkdirSync(sessionsDir, { recursive: true });
		}
		const entries = Array.from(claudeSessions.entries());
		writeFileSync(sessionsFile, JSON.stringify(entries), "utf-8");
	} catch (err) {
		console.warn("[agent/session-store] Failed to persist sessions:", err);
	}
}

function evictStaleSessions(): void {
	const now = Date.now();
	for (const [key, entry] of claudeSessions) {
		if (now - entry.lastAccessedAt > SESSION_TTL_MS) {
			claudeSessions.delete(key);
		}
	}

	if (claudeSessions.size > SESSION_MAX_SIZE) {
		const sorted = [...claudeSessions.entries()].sort(
			(a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt,
		);
		const toRemove = sorted.slice(0, claudeSessions.size - SESSION_MAX_SIZE);
		for (const [key] of toRemove) {
			claudeSessions.delete(key);
		}
	}
}

export function getClaudeSessionId(sessionId: string): string | undefined {
	const entry = claudeSessions.get(sessionId);
	if (entry) {
		entry.lastAccessedAt = Date.now();
	}
	return entry?.claudeSessionId;
}

export function setClaudeSessionId(
	sessionId: string,
	claudeSessionId: string,
): void {
	evictStaleSessions();
	claudeSessions.set(sessionId, {
		claudeSessionId,
		lastAccessedAt: Date.now(),
	});
	persistSessions();
}

export function getActiveSessionCount(): number {
	return claudeSessions.size;
}
