/**
 * Provider-agnostic session metadata store.
 *
 * Persists chat session metadata to disk via lowdb so sessions survive
 * pane close/reopen and app restart. The store is unaware of any specific
 * agent provider — it just records opaque metadata.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { JSONFilePreset } from "lowdb/node";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export interface ChatSessionMeta {
	sessionId: string;
	workspaceId: string;
	/** Provider that owns this session ("claude-sdk", etc.) */
	provider: string;
	/** Opaque resume token from the provider (e.g. claudeSessionId) */
	providerSessionId?: string;
	title: string;
	cwd: string;
	createdAt: number;
	lastActiveAt: number;
	messagePreview?: string;
	isArchived: boolean;
}

interface SessionStoreData {
	sessions: ChatSessionMeta[];
}

// ----------------------------------------------------------------------------
// Store path
// ----------------------------------------------------------------------------

const SUPERSET_DIR =
	process.env.NODE_ENV === "development" ? ".superset-dev" : ".superset";
const STORE_PATH = join(homedir(), SUPERSET_DIR, "chat-sessions.json");

// ----------------------------------------------------------------------------
// SessionStore
// ----------------------------------------------------------------------------

export class SessionStore {
	private db: Awaited<
		ReturnType<typeof JSONFilePreset<SessionStoreData>>
	> | null = null;

	private async ensureDb() {
		if (this.db) return this.db;

		const dir = dirname(STORE_PATH);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		this.db = await JSONFilePreset<SessionStoreData>(STORE_PATH, {
			sessions: [],
		});
		return this.db;
	}

	async create(meta: Omit<ChatSessionMeta, "isArchived">): Promise<void> {
		const db = await this.ensureDb();
		const existing = db.data.sessions.find(
			(s) => s.sessionId === meta.sessionId,
		);
		if (existing) {
			// Update instead of duplicate
			Object.assign(existing, meta, { isArchived: false });
		} else {
			db.data.sessions.push({ ...meta, isArchived: false });
		}
		await db.write();
	}

	async update(
		sessionId: string,
		patch: Partial<
			Pick<
				ChatSessionMeta,
				| "providerSessionId"
				| "title"
				| "lastActiveAt"
				| "messagePreview"
				| "isArchived"
			>
		>,
	): Promise<void> {
		const db = await this.ensureDb();
		const session = db.data.sessions.find((s) => s.sessionId === sessionId);
		if (!session) return;
		Object.assign(session, patch);
		await db.write();
	}

	async get(sessionId: string): Promise<ChatSessionMeta | undefined> {
		const db = await this.ensureDb();
		return db.data.sessions.find(
			(s) => s.sessionId === sessionId && !s.isArchived,
		);
	}

	async listByWorkspace(workspaceId: string): Promise<ChatSessionMeta[]> {
		const db = await this.ensureDb();
		return db.data.sessions
			.filter((s) => s.workspaceId === workspaceId && !s.isArchived)
			.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
	}

	async archive(sessionId: string): Promise<void> {
		await this.update(sessionId, { isArchived: true });
	}
}
