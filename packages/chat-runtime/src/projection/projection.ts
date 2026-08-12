import { desc, eq } from "drizzle-orm";
import type { ChatDb, ChatSessionRow } from "../db";
import { chatSessionsLocal } from "../db";

export type SessionRowInsert = typeof chatSessionsLocal.$inferInsert;

export type SessionProjection = {
	status: string;
	title: string | null;
	queuedCount: number;
	updatedAt: number;
};

export function readSessionRow(
	db: ChatDb,
	sessionId: string,
): ChatSessionRow | null {
	return (
		db
			.select()
			.from(chatSessionsLocal)
			.where(eq(chatSessionsLocal.sessionId, sessionId))
			.get() ?? null
	);
}

export function insertSessionRow(db: ChatDb, row: SessionRowInsert): void {
	db.insert(chatSessionsLocal).values(row).run();
}

export function setSessionEpoch(
	db: ChatDb,
	sessionId: string,
	epoch: string,
	updatedAt: number,
): void {
	db.update(chatSessionsLocal)
		.set({ epoch, updatedAt })
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function resetSessionForEpoch(
	db: ChatDb,
	sessionId: string,
	epoch: string,
	status: string,
	updatedAt: number,
): void {
	db.update(chatSessionsLocal)
		.set({ epoch, status, title: null, queuedCount: 0, updatedAt })
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function removeSessionRow(db: ChatDb, sessionId: string): void {
	db.delete(chatSessionsLocal)
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export function writeSessionProjection(
	db: ChatDb,
	sessionId: string,
	projection: SessionProjection,
): void {
	db.update(chatSessionsLocal)
		.set(projection)
		.where(eq(chatSessionsLocal.sessionId, sessionId))
		.run();
}

export class ChatSessionStore {
	constructor(private readonly db: ChatDb) {}

	get(sessionId: string): ChatSessionRow | null {
		return readSessionRow(this.db, sessionId);
	}

	list(): ChatSessionRow[] {
		return this.db
			.select()
			.from(chatSessionsLocal)
			.orderBy(desc(chatSessionsLocal.updatedAt))
			.all();
	}

	listByScope(scopeId: string): ChatSessionRow[] {
		return this.db
			.select()
			.from(chatSessionsLocal)
			.where(eq(chatSessionsLocal.scopeId, scopeId))
			.orderBy(desc(chatSessionsLocal.updatedAt))
			.all();
	}

	setHarnessSessionId(
		sessionId: string,
		harnessSessionId: string | null,
	): void {
		this.db
			.update(chatSessionsLocal)
			.set({ harnessSessionId, updatedAt: Date.now() })
			.where(eq(chatSessionsLocal.sessionId, sessionId))
			.run();
	}
}
