import type { Cursor } from "../../protocol/cursor";
import type {
	DeltaChannel,
	DurableEvent,
	Envelope,
	SessionState,
	Turn,
} from "../../protocol/envelope";
import {
	isDeltaEnvelope,
	isDurableEnvelope,
	isResetEnvelope,
} from "../../protocol/envelope";
import type { Item } from "../../protocol/items";

export type StoredItem = {
	item: Item;
	turnId: string;
};

export type SessionSnapshot = {
	session: SessionState | null;
	turns: ReadonlyMap<string, Turn>;
	items: ReadonlyMap<string, StoredItem>;
	liveStreams: ReadonlyMap<string, string>;
	cursor: Cursor | null;
	pendingReset: string | null;
};

export function emptySnapshot(): SessionSnapshot {
	return {
		session: null,
		turns: new Map(),
		items: new Map(),
		liveStreams: new Map(),
		cursor: null,
		pendingReset: null,
	};
}

type MutableSnapshot = {
	session: SessionState | null;
	turns: Map<string, Turn>;
	items: Map<string, StoredItem>;
	liveStreams: Map<string, string>;
	cursor: Cursor | null;
	pendingReset: string | null;
};

function thaw(snapshot: SessionSnapshot): MutableSnapshot {
	return {
		session: snapshot.session,
		turns: new Map(snapshot.turns),
		items: new Map(snapshot.items),
		liveStreams: new Map(snapshot.liveStreams),
		cursor: snapshot.cursor,
		pendingReset: snapshot.pendingReset,
	};
}

function streamKey(channel: DeltaChannel, itemId: string): string {
	return `${channel}:${itemId}`;
}

function snapshotTextFor(channel: DeltaChannel, item: Item): string {
	if (
		channel === "text" &&
		(item.kind === "agent_message" || item.kind === "reasoning")
	) {
		const text = (item as { text?: unknown }).text;
		if (typeof text === "string") return text;
	}
	return "";
}

function applyDurable(draft: MutableSnapshot, event: DurableEvent): void {
	switch (event.type) {
		case "item": {
			draft.items.set(event.item.id, {
				item: event.item,
				turnId: event.turnId,
			});
			for (const channel of ["text", "tool_input", "terminal"] as const) {
				draft.liveStreams.delete(streamKey(channel, event.item.id));
			}
			return;
		}
		case "turn": {
			draft.turns.set(event.turn.id, event.turn);
			return;
		}
		case "session": {
			draft.session = event.session;
			return;
		}
	}
}

function applyEnvelope(draft: MutableSnapshot, envelope: Envelope): void {
	if (isResetEnvelope(envelope)) {
		draft.pendingReset = envelope.reset.reason;
		return;
	}

	if (isDurableEnvelope(envelope)) {
		if (draft.cursor && draft.cursor.epoch !== envelope.cursor.epoch) {
			draft.pendingReset = "epoch_changed";
			return;
		}
		applyDurable(draft, envelope.event);
		if (!draft.cursor || envelope.cursor.seq > draft.cursor.seq) {
			draft.cursor = envelope.cursor;
		}
		return;
	}

	if (isDeltaEnvelope(envelope)) {
		const delta = envelope.delta;
		const key = streamKey(delta.type, delta.itemId);
		const existing = draft.liveStreams.get(key);
		if (existing !== undefined) {
			draft.liveStreams.set(key, existing + delta.append);
			return;
		}
		const stored = draft.items.get(delta.itemId);
		const base = stored ? snapshotTextFor(delta.type, stored.item) : "";
		draft.liveStreams.set(key, base + delta.append);
	}
}

export function reduceMany(
	prev: SessionSnapshot,
	envelopes: readonly Envelope[],
): SessionSnapshot {
	if (envelopes.length === 0) return prev;
	const draft = thaw(prev);
	for (const envelope of envelopes) applyEnvelope(draft, envelope);
	return draft;
}

export function reduce(
	prev: SessionSnapshot,
	envelope: Envelope,
): SessionSnapshot {
	return reduceMany(prev, [envelope]);
}

export function liveStream(
	snapshot: SessionSnapshot,
	channel: DeltaChannel,
	itemId: string,
): string | undefined {
	return snapshot.liveStreams.get(streamKey(channel, itemId));
}

export function displayText(snapshot: SessionSnapshot, itemId: string): string {
	const live = liveStream(snapshot, "text", itemId);
	if (live !== undefined) return live;
	const stored = snapshot.items.get(itemId);
	return stored ? snapshotTextFor("text", stored.item) : "";
}
