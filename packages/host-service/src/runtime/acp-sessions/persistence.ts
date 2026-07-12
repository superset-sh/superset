import type { HarnessKind, StopReason } from "@superset/session-protocol";
import type { HostDb } from "../../db";
import { acpSessions } from "../../db/schema";

/**
 * One persisted session-registry row — the minimum needed to list a session
 * after a host restart and resurrect it via the adapter's `session/load`.
 * The journal/transcript is NOT here: replay comes from the agent harness's
 * own on-disk session store, keyed by `acpSessionId`.
 */
export interface AcpSessionRecord {
	sessionId: string;
	workspaceId: string;
	/** Adapter-side ACP session id — the `session/load` key. */
	acpSessionId: string;
	harness: HarnessKind;
	cwd: string;
	title: string | null;
	lastStopReason: StopReason | null;
	createdAt: number;
	updatedAt: number;
}

/**
 * Durable registry behind AcpSessionManager. `loadAll` seeds the manager's
 * offline set at startup; `upsert` runs on every state emit (create, title
 * change, turn end, death) and must be cheap — the manager treats failures
 * as best-effort and never lets them break the live path.
 */
export interface AcpSessionPersistence {
	loadAll(): AcpSessionRecord[];
	upsert(record: AcpSessionRecord): void;
}

export class SqliteAcpSessionPersistence implements AcpSessionPersistence {
	constructor(private readonly db: HostDb) {}

	loadAll(): AcpSessionRecord[] {
		return this.db.select().from(acpSessions).all();
	}

	upsert(record: AcpSessionRecord): void {
		this.db
			.insert(acpSessions)
			.values(record)
			.onConflictDoUpdate({
				target: acpSessions.sessionId,
				set: {
					workspaceId: record.workspaceId,
					acpSessionId: record.acpSessionId,
					harness: record.harness,
					cwd: record.cwd,
					title: record.title,
					lastStopReason: record.lastStopReason,
					createdAt: record.createdAt,
					updatedAt: record.updatedAt,
				},
			})
			.run();
	}
}
