import type {
	Cursor,
	DurableEnvelope,
	RESET_REASONS,
} from "@superset/chat/protocol";
import { envelopeSchema, isDurableEnvelope } from "@superset/chat/protocol";
import { and, asc, desc, eq, gt, lt, max } from "drizzle-orm";
import type { ChatDb, JournalRow } from "../db";
import { chatJournal } from "../db";
import { readSessionRow } from "../projection";

export type ChatResetReason = (typeof RESET_REASONS)[number];

export type ReplayResult =
	| { ok: true; envelopes: DurableEnvelope[] }
	| { ok: false; reset: ChatResetReason };

export type PageResult =
	| { ok: true; envelopes: DurableEnvelope[]; nextBefore: Cursor | null }
	| { ok: false; reset: ChatResetReason };

export function parseJournalRow(row: JournalRow): DurableEnvelope {
	const envelope = envelopeSchema.parse({
		v: 1,
		sessionId: row.sessionId,
		cursor: { epoch: row.epoch, seq: row.seq },
		ts: row.ts,
		event: JSON.parse(row.eventJson),
	});
	if (!isDurableEnvelope(envelope)) {
		throw new Error(
			`chat journal row ${row.sessionId}:${row.seq} is not durable`,
		);
	}
	return envelope;
}

function parseJournalRows(rows: JournalRow[]): DurableEnvelope[] | null {
	const envelopes: DurableEnvelope[] = [];
	for (const row of rows) {
		try {
			envelopes.push(parseJournalRow(row));
		} catch {
			return null;
		}
	}
	return envelopes;
}

export function latestSeq(
	db: ChatDb,
	sessionId: string,
	epoch: string,
): number {
	const row = db
		.select({ value: max(chatJournal.seq) })
		.from(chatJournal)
		.where(
			and(eq(chatJournal.sessionId, sessionId), eq(chatJournal.epoch, epoch)),
		)
		.get();
	return row?.value ?? 0;
}

export function readSince(
	db: ChatDb,
	sessionId: string,
	cursor: Cursor,
): ReplayResult {
	const session = readSessionRow(db, sessionId);
	if (!session) return { ok: false, reset: "session_not_found" };
	if (session.epoch !== cursor.epoch) {
		return { ok: false, reset: "epoch_changed" };
	}

	const last = latestSeq(db, sessionId, session.epoch);
	if (last === 0 && cursor.seq > 0) {
		return { ok: false, reset: "journal_missing" };
	}
	if (cursor.seq > last) return { ok: false, reset: "invalid_cursor" };

	const rows = db
		.select()
		.from(chatJournal)
		.where(
			and(
				eq(chatJournal.sessionId, sessionId),
				eq(chatJournal.epoch, session.epoch),
				gt(chatJournal.seq, cursor.seq),
			),
		)
		.orderBy(asc(chatJournal.seq))
		.all();

	const envelopes = parseJournalRows(rows);
	if (!envelopes) return { ok: false, reset: "journal_missing" };
	return { ok: true, envelopes };
}

export function readPage(
	db: ChatDb,
	sessionId: string,
	options: { before?: Cursor; limit: number },
): PageResult {
	const session = readSessionRow(db, sessionId);
	if (!session) return { ok: false, reset: "session_not_found" };
	if (options.before && session.epoch !== options.before.epoch) {
		return { ok: false, reset: "epoch_changed" };
	}
	if (
		options.before &&
		options.before.seq > latestSeq(db, sessionId, session.epoch)
	) {
		return { ok: false, reset: "invalid_cursor" };
	}
	if (options.limit <= 0) return { ok: true, envelopes: [], nextBefore: null };

	const filters = [
		eq(chatJournal.sessionId, sessionId),
		eq(chatJournal.epoch, session.epoch),
	];
	if (options.before) filters.push(lt(chatJournal.seq, options.before.seq));

	const rows = db
		.select()
		.from(chatJournal)
		.where(and(...filters))
		.orderBy(desc(chatJournal.seq))
		.limit(options.limit + 1)
		.all();

	const page = rows.slice(0, options.limit).reverse();
	const oldest = page[0];
	const nextBefore =
		rows.length > options.limit && oldest
			? { epoch: session.epoch, seq: oldest.seq }
			: null;

	const envelopes = parseJournalRows(page);
	if (!envelopes) return { ok: false, reset: "journal_missing" };

	return { ok: true, envelopes, nextBefore };
}
