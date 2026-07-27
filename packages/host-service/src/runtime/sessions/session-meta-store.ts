import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { sessionMeta } from "../../db/schema";

/**
 * One session's persisted top-level canonical metadata: the host-side edits
 * (title override, archive, close) the adapter has no notion of. This is
 * deliberately ALL the canonical layer persists — no messages, no events;
 * conversation content lives in the vendor's own transcript and is resumed
 * via the native session id in the `acp_sessions` registry.
 */
export interface SessionMetaRecord {
	sessionId: string;
	/** Distinguishes "no override" (adapter title shows) from a cleared title. */
	titleOverridden: boolean;
	title: string | null;
	archivedAt: number | null;
	closedAt: number | null;
}

/**
 * Durable store behind CanonicalSessionsRuntime's session overrides.
 * `loadAll` seeds the runtime at construction; `upsert` runs on every
 * override write (create title, update) and is best-effort — a failure must
 * never break the live path.
 */
export interface SessionMetaStore {
	loadAll(): SessionMetaRecord[];
	upsert(record: SessionMetaRecord): void;
	delete(sessionId: string): void;
}

export class SqliteSessionMetaStore implements SessionMetaStore {
	constructor(private readonly db: HostDb) {}

	loadAll(): SessionMetaRecord[] {
		return this.db
			.select()
			.from(sessionMeta)
			.all()
			.map((row) => ({
				sessionId: row.sessionId,
				titleOverridden: row.titleOverridden,
				title: row.title,
				archivedAt: row.archivedAt,
				closedAt: row.closedAt,
			}));
	}

	upsert(record: SessionMetaRecord): void {
		const now = Date.now();
		this.db
			.insert(sessionMeta)
			.values({ ...record, updatedAt: now })
			.onConflictDoUpdate({
				target: sessionMeta.sessionId,
				set: {
					titleOverridden: record.titleOverridden,
					title: record.title,
					archivedAt: record.archivedAt,
					closedAt: record.closedAt,
					updatedAt: now,
				},
			})
			.run();
	}

	delete(sessionId: string): void {
		this.db
			.delete(sessionMeta)
			.where(eq(sessionMeta.sessionId, sessionId))
			.run();
	}
}
