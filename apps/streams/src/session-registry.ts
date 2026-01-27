/**
 * Session Registry
 *
 * In-memory session registry with file persistence for tracking chat sessions.
 * This provides a lightweight session index without full database persistence.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface SessionInfo {
	sessionId: string;
	title: string;
	createdAt: string;
	createdBy?: string;
}

export class SessionRegistry {
	private sessions: Map<string, SessionInfo> = new Map();
	private filePath: string;

	constructor(dataDir: string) {
		this.filePath = join(dataDir, "sessions.json");
		this.load();
	}

	list(): SessionInfo[] {
		return Array.from(this.sessions.values()).sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);
	}

	get(sessionId: string): SessionInfo | undefined {
		return this.sessions.get(sessionId);
	}

	register(info: Omit<SessionInfo, "createdAt">): SessionInfo {
		const existing = this.sessions.get(info.sessionId);
		if (existing) {
			return existing;
		}

		const session: SessionInfo = {
			...info,
			createdAt: new Date().toISOString(),
		};

		this.sessions.set(info.sessionId, session);
		this.persist();

		return session;
	}

	private persist(): void {
		try {
			const dir = dirname(this.filePath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			const data = JSON.stringify(Array.from(this.sessions.values()), null, 2);
			writeFileSync(this.filePath, data, "utf-8");
		} catch (error) {
			console.error("[session-registry] Failed to persist sessions:", error);
		}
	}

	private load(): void {
		try {
			if (existsSync(this.filePath)) {
				const data = readFileSync(this.filePath, "utf-8");
				const sessions: SessionInfo[] = JSON.parse(data);
				for (const session of sessions) {
					this.sessions.set(session.sessionId, session);
				}
				console.log(
					`[session-registry] Loaded ${sessions.length} sessions from disk`,
				);
			}
		} catch (error) {
			console.error("[session-registry] Failed to load sessions:", error);
		}
	}
}
