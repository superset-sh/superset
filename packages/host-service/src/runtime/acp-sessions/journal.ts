import type {
	SessionUpdateEnvelope,
	SessionUpdateFrame,
} from "@superset/session-protocol";

export interface JournalPage {
	/** Matching envelopes in ascending seq order. */
	items: SessionUpdateEnvelope[];
	/** Seq before which the next (older) page starts, or null when exhausted. */
	nextBeforeSeq: number | null;
}

/**
 * Per-session ring buffer of update envelopes with a gapless, monotonic seq
 * starting at 1. Envelopes older than `capacity` are evicted; `after` reports
 * a no-longer-servable cursor as null so the caller can signal `reset`.
 */
export class SessionJournal {
	private readonly entries: SessionUpdateEnvelope[] = [];
	private nextSeq = 1;
	private readonly capacity: number;

	constructor(capacity = 5_000) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new Error(
				`journal capacity must be a positive integer: ${capacity}`,
			);
		}
		this.capacity = capacity;
	}

	/** Seq of the newest journaled envelope, or 0 when nothing was journaled. */
	get latestSeq(): number {
		return this.nextSeq - 1;
	}

	/** Oldest retained seq, or 0 when the journal is empty. */
	get oldestSeq(): number {
		return this.entries.length === 0 ? 0 : this.nextSeq - this.entries.length;
	}

	append(sessionId: string, frame: SessionUpdateFrame): SessionUpdateEnvelope {
		const envelope: SessionUpdateEnvelope = {
			seq: this.nextSeq,
			sessionId,
			ts: Date.now(),
			frame,
		};
		this.nextSeq += 1;
		this.entries.push(envelope);
		if (this.entries.length > this.capacity) {
			this.entries.shift();
		}
		return envelope;
	}

	/**
	 * Envelopes with seq > since, oldest first — the catch-up replay for a
	 * subscriber resuming at cursor `since`. Returns null when the cursor is
	 * not servable: part of the range was evicted, or the cursor is ahead of
	 * everything journaled (a stale cursor from a prior session incarnation —
	 * serving [] would leave the client discarding every live envelope as a
	 * duplicate). The client must resync from scratch in both cases.
	 */
	after(since: number): SessionUpdateEnvelope[] | null {
		if (since === this.latestSeq) return [];
		if (since > this.latestSeq) return null;
		const startIndex = since + 1 - this.oldestSeq;
		if (startIndex < 0) return null;
		return this.entries.slice(startIndex);
	}

	/**
	 * Newest-first pagination: walk backwards from `beforeSeq` (exclusive;
	 * from the newest entry when omitted) collecting up to `limit` envelopes
	 * accepted by `matches`, returned in ascending seq order. `nextBeforeSeq`
	 * is set only when an older matching envelope is still retained.
	 */
	page(options: {
		beforeSeq?: number;
		limit: number;
		matches: (envelope: SessionUpdateEnvelope) => boolean;
	}): JournalPage {
		const { beforeSeq, limit, matches } = options;
		const items: SessionUpdateEnvelope[] = [];
		let nextBeforeSeq: number | null = null;
		for (let index = this.entries.length - 1; index >= 0; index -= 1) {
			const envelope = this.entries[index];
			if (!envelope) continue;
			if (beforeSeq !== undefined && envelope.seq >= beforeSeq) continue;
			if (!matches(envelope)) continue;
			if (items.length < limit) {
				items.push(envelope);
			} else {
				const oldestCollected = items[items.length - 1];
				nextBeforeSeq = oldestCollected ? oldestCollected.seq : null;
				break;
			}
		}
		items.reverse();
		return { items, nextBeforeSeq };
	}
}
