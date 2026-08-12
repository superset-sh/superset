import { type Coalescer, createCoalescer } from "@superset/chat/core";
import type {
	Cursor,
	DeltaChannel,
	DeltaEnvelope,
	Envelope,
} from "@superset/chat/protocol";
import { isDeltaEnvelope } from "@superset/chat/protocol";
import type { ChatDb } from "../../db";
import type { ChatResetReason } from "../../replay";
import { readPage, readSince } from "../../replay";

export const DELTA_FLUSH_MS = 33;
export const DEFAULT_BOOTSTRAP_LIMIT = 200;

export type Sink = {
	send(envelope: Envelope): void;
	close(): void;
};

export type SubscribeOptions = {
	since?: Cursor;
	deltas: DeltaChannel[];
};

export type Subscription = {
	unsubscribe(): void;
};

export type Schedule = (callback: () => void) => () => void;

export type SubscriptionHubOptions = {
	schedule?: Schedule;
	bootstrapLimit?: number;
};

type Subscriber = {
	sink: Sink;
	deltas: Set<DeltaChannel>;
};

const defaultSchedule: Schedule = (callback) => {
	const timer = setTimeout(callback, DELTA_FLUSH_MS);
	return () => clearTimeout(timer);
};

function mergeDeltas(batch: DeltaEnvelope[]): DeltaEnvelope[] {
	const merged: DeltaEnvelope[] = [];
	for (const envelope of batch) {
		const previous = merged.at(-1);
		if (
			previous &&
			previous.delta.type === envelope.delta.type &&
			previous.delta.itemId === envelope.delta.itemId
		) {
			merged[merged.length - 1] = {
				...envelope,
				delta: {
					...envelope.delta,
					append: previous.delta.append + envelope.delta.append,
				},
			};
			continue;
		}
		merged.push(envelope);
	}
	return merged;
}

export class SubscriptionHub {
	private readonly subscribers = new Map<string, Set<Subscriber>>();
	private readonly coalescers = new Map<string, Coalescer<DeltaEnvelope>>();
	private readonly schedule: Schedule;
	private readonly bootstrapLimit: number;

	constructor(
		private readonly db: ChatDb,
		options: SubscriptionHubOptions = {},
	) {
		this.schedule = options.schedule ?? defaultSchedule;
		this.bootstrapLimit = options.bootstrapLimit ?? DEFAULT_BOOTSTRAP_LIMIT;
	}

	subscribe(
		sessionId: string,
		options: SubscribeOptions,
		sink: Sink,
	): Subscription {
		this.flushDeltas(sessionId);

		const replay = options.since
			? readSince(this.db, sessionId, options.since)
			: readPage(this.db, sessionId, { limit: this.bootstrapLimit });

		try {
			if (replay.ok) {
				for (const envelope of replay.envelopes) sink.send(envelope);
			} else {
				sink.send(this.resetEnvelope(sessionId, replay.reset));
			}
		} catch {
			return { unsubscribe: () => undefined };
		}

		const subscriber: Subscriber = { sink, deltas: new Set(options.deltas) };
		const existing = this.subscribers.get(sessionId);
		if (existing) existing.add(subscriber);
		else this.subscribers.set(sessionId, new Set([subscriber]));

		return { unsubscribe: () => this.remove(sessionId, subscriber) };
	}

	publish(envelope: Envelope): void {
		if (isDeltaEnvelope(envelope)) {
			if (this.subscriberCount(envelope.sessionId) === 0) return;
			this.coalescerFor(envelope.sessionId).push(envelope);
			return;
		}
		this.flushDeltas(envelope.sessionId);
		this.deliver(envelope.sessionId, envelope);
	}

	flushDeltas(sessionId: string): void {
		this.coalescers.get(sessionId)?.flush();
	}

	subscriberCount(sessionId: string): number {
		return this.subscribers.get(sessionId)?.size ?? 0;
	}

	dispose(): void {
		for (const coalescer of this.coalescers.values()) coalescer.dispose();
		this.coalescers.clear();
		for (const set of this.subscribers.values()) {
			for (const subscriber of set) subscriber.sink.close();
		}
		this.subscribers.clear();
	}

	private coalescerFor(sessionId: string): Coalescer<DeltaEnvelope> {
		const existing = this.coalescers.get(sessionId);
		if (existing) return existing;
		const coalescer = createCoalescer<DeltaEnvelope>((batch) => {
			for (const envelope of mergeDeltas(batch)) {
				this.deliver(sessionId, envelope);
			}
		}, this.schedule);
		this.coalescers.set(sessionId, coalescer);
		return coalescer;
	}

	private deliver(sessionId: string, envelope: Envelope): void {
		const set = this.subscribers.get(sessionId);
		if (!set) return;
		const delta = isDeltaEnvelope(envelope) ? envelope.delta : null;
		for (const subscriber of [...set]) {
			if (delta && !subscriber.deltas.has(delta.type)) continue;
			try {
				subscriber.sink.send(envelope);
			} catch {
				this.remove(sessionId, subscriber);
				this.closeQuietly(subscriber);
			}
		}
	}

	private remove(sessionId: string, subscriber: Subscriber): void {
		const set = this.subscribers.get(sessionId);
		if (!set) return;
		set.delete(subscriber);
		if (set.size > 0) return;
		this.subscribers.delete(sessionId);
		this.coalescers.get(sessionId)?.dispose();
		this.coalescers.delete(sessionId);
	}

	private closeQuietly(subscriber: Subscriber): void {
		try {
			subscriber.sink.close();
		} catch {
			return;
		}
	}

	private resetEnvelope(sessionId: string, reason: ChatResetReason): Envelope {
		return { v: 1, sessionId, ts: Date.now(), reset: { reason } };
	}
}
