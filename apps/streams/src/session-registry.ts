/**
 * Session Registry
 *
 * In-memory session registry with file persistence for tracking chat sessions.
 * This provides a lightweight session index without full database persistence.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const LOG_PREFIX = "[session-registry]";
const SESSIONS_FILE = "sessions.json";
const TMP_SUFFIX = ".tmp";

export interface SessionInfo {
	sessionId: string;
	title: string;
	createdAt: string;
	createdBy?: string;
}

export class SessionRegistry {
	private sessions: Map<string, SessionInfo> = new Map();
	private filePath: string;
	private persistQueue: Promise<void> = Promise.resolve();

	constructor(dataDir: string) {
		this.filePath = join(dataDir, SESSIONS_FILE);
	}

	async init(): Promise<void> {
		await this.load();
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
		this.persistQueue = this.persistQueue.then(async () => {
			try {
				const dir = dirname(this.filePath);
				await mkdir(dir, { recursive: true });
				const data = JSON.stringify(
					Array.from(this.sessions.values()),
					null,
					2,
				);
				// Write to temp file then rename for crash safety
				const tmpPath = `${this.filePath}${TMP_SUFFIX}`;
				await writeFile(tmpPath, data, "utf-8");
				await rename(tmpPath, this.filePath);
			} catch (error) {
				console.error(`${LOG_PREFIX} Failed to persist sessions:`, error);
			}
		});
	}

	private async load(): Promise<void> {
		try {
			const data = await readFile(this.filePath, "utf-8");
			const sessions: SessionInfo[] = JSON.parse(data);
			for (const session of sessions) {
				this.sessions.set(session.sessionId, session);
			}
			console.log(`${LOG_PREFIX} Loaded ${sessions.length} sessions from disk`);
		} catch (error) {
			const err = error as NodeJS.ErrnoException;
			if (err.code === "ENOENT") {
				return;
			}
			console.error(`${LOG_PREFIX} Failed to load sessions:`, error);
		}
	}
}
