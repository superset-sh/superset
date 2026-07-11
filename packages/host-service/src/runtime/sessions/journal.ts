import type {
	SessionEventEnvelope,
	SessionEventFrame,
} from "@superset/session-protocol";

export interface JournalPage {
	/** Matching envelopes in ascending sequence order. */
	items: SessionEventEnvelope[];
	/** Sequence before which the next older page starts, or null when exhausted. */
	nextBeforeSeq: number | null;
}

/**
 * Per-session ring buffer with a monotonic, gapless sequence beginning at one.
 * It is a live-delivery recovery buffer, not transcript persistence.
 */
export class SessionJournal {
	private readonly entries: SessionEventEnvelope[] = [];
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

	get latestSeq(): number {
		return this.nextSeq - 1;
	}

	get oldestSeq(): number {
		return this.entries.length === 0 ? 0 : this.nextSeq - this.entries.length;
	}

	append(sessionId: string, frame: SessionEventFrame): SessionEventEnvelope {
		const envelope: SessionEventEnvelope = {
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
	 * Return envelopes in (since, latest]. Null means the cursor cannot be
	 * reconciled with this journal, including a cursor from a newer session
	 * epoch. Treating a future cursor as an empty tail wedges clients forever:
	 * every real envelope is then discarded as an apparent duplicate.
	 */
	after(since: number): SessionEventEnvelope[] | null {
		if (since > this.latestSeq) return null;
		if (since === this.latestSeq) return [];
		const startIndex = since + 1 - this.oldestSeq;
		if (startIndex < 0) return null;
		return this.entries.slice(startIndex);
	}

	page(options: {
		beforeSeq?: number;
		limit: number;
		matches: (envelope: SessionEventEnvelope) => boolean;
	}): JournalPage {
		const { beforeSeq, limit, matches } = options;
		const items: SessionEventEnvelope[] = [];
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
				nextBeforeSeq = oldestCollected?.seq ?? null;
				break;
			}
		}
		items.reverse();
		return { items, nextBeforeSeq };
	}
}
