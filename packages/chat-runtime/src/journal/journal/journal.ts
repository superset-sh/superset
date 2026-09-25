import type {
	Cursor,
	DurableEnvelope,
	DurableEvent,
} from "@superset/chat/protocol";
import { durableEventSchema } from "@superset/chat/protocol";
import { eq } from "drizzle-orm";
import type { ChatDb } from "../../db";
import { chatJournal } from "../../db";
import {
	readSessionRow,
	removeSessionRow,
	writeSessionProjection,
} from "../../projection";
import { readSince } from "../../replay";
import type { ChatSessionInit } from "../epoch";
import { openEpoch } from "../epoch";

export type OpenedSession = {
	sessionId: string;
	epoch: string;
	lastSeq: number;
	queuedCount: number;
};

type SessionCache = {
	epoch: string;
	lastSeq: number;
	queuedItemIds: Set<string>;
	status: string;
	title: string | null;
};

type NextProjection = {
	status: string;
	title: string | null;
	queuedItemIds: Set<string>;
};

export class ChatJournal {
	private readonly sessions = new Map<string, SessionCache>();

	constructor(private readonly db: ChatDb) {}

	open(init: ChatSessionInit): OpenedSession {
		const { epoch } = openEpoch(this.db, init);
		this.sessions.delete(init.sessionId);
		const cache = this.cacheFor(init.sessionId, epoch);
		return {
			sessionId: init.sessionId,
			epoch: cache.epoch,
			lastSeq: cache.lastSeq,
			queuedCount: cache.queuedItemIds.size,
		};
	}

	append(sessionId: string, event: DurableEvent): Cursor {
		return this.appendEnvelope(sessionId, event).cursor;
	}

	appendEnvelope(sessionId: string, event: DurableEvent): DurableEnvelope {
		const parsed = durableEventSchema.parse(event);
		const cache = this.cacheFor(sessionId);
		const seq = cache.lastSeq + 1;
		const ts = Date.now();
		const next = this.projectionFor(cache, parsed);

		this.db.transaction(() => {
			this.db
				.insert(chatJournal)
				.values({
					sessionId,
					epoch: cache.epoch,
					seq,
					ts,
					eventJson: JSON.stringify(parsed),
				})
				.run();
			writeSessionProjection(this.db, sessionId, {
				status: next.status,
				title: next.title,
				queuedCount: next.queuedItemIds.size,
				updatedAt: ts,
			});
		});

		cache.lastSeq = seq;
		cache.status = next.status;
		cache.title = next.title;
		cache.queuedItemIds = next.queuedItemIds;

		return {
			v: 1,
			sessionId,
			cursor: { epoch: cache.epoch, seq },
			ts,
			event: parsed,
		};
	}

	cursor(sessionId: string): Cursor {
		const cache = this.cacheFor(sessionId);
		return { epoch: cache.epoch, seq: cache.lastSeq };
	}

	forget(sessionId: string): void {
		this.sessions.delete(sessionId);
	}

	discard(sessionId: string): void {
		this.sessions.delete(sessionId);
		this.db.transaction(() => {
			this.db
				.delete(chatJournal)
				.where(eq(chatJournal.sessionId, sessionId))
				.run();
			removeSessionRow(this.db, sessionId);
		});
	}

	private projectionFor(
		cache: SessionCache,
		event: DurableEvent,
	): NextProjection {
		if (event.type === "session") {
			return {
				status: event.session.status,
				title: event.session.title ?? cache.title,
				queuedItemIds: cache.queuedItemIds,
			};
		}

		if (event.type === "item" && event.item.kind === "user_message") {
			const queuedItemIds = new Set(cache.queuedItemIds);
			if ("queued" in event.item && event.item.queued === true) {
				queuedItemIds.add(event.item.id);
			} else {
				queuedItemIds.delete(event.item.id);
			}
			return { status: cache.status, title: cache.title, queuedItemIds };
		}

		return {
			status: cache.status,
			title: cache.title,
			queuedItemIds: cache.queuedItemIds,
		};
	}

	private cacheFor(sessionId: string, knownEpoch?: string): SessionCache {
		const cached = this.sessions.get(sessionId);
		if (cached) return cached;

		const row = readSessionRow(this.db, sessionId);
		if (!row) throw new Error(`chat session ${sessionId} not found`);

		const epoch = knownEpoch ?? row.epoch;
		const replay = readSince(this.db, sessionId, { epoch, seq: 0 });
		if (!replay.ok) {
			throw new Error(
				`chat journal unreadable for ${sessionId}: ${replay.reset}`,
			);
		}

		const queuedItemIds = new Set<string>();
		let lastSeq = 0;
		let status = row.status;
		let title = row.title;
		for (const envelope of replay.envelopes) {
			lastSeq = envelope.cursor.seq;
			const event = envelope.event;
			if (event.type === "session") {
				status = event.session.status;
				title = event.session.title ?? title;
				continue;
			}
			if (event.type !== "item" || event.item.kind !== "user_message") continue;
			if ("queued" in event.item && event.item.queued === true) {
				queuedItemIds.add(event.item.id);
			} else {
				queuedItemIds.delete(event.item.id);
			}
		}

		const cache: SessionCache = {
			epoch,
			lastSeq,
			queuedItemIds,
			status,
			title,
		};
		this.sessions.set(sessionId, cache);
		return cache;
	}
}
