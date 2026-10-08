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

type MapKey = "turns" | "items" | "liveStreams";

type Draft = {
	base: SessionSnapshot;
	session: SessionState | null;
	cursor: Cursor | null;
	pendingReset: string | null;
	turns?: Map<string, Turn>;
	items?: Map<string, StoredItem>;
	liveStreams?: Map<string, string>;
};

function startDraft(base: SessionSnapshot): Draft {
	return {
		base,
		session: base.session,
		cursor: base.cursor,
		pendingReset: base.pendingReset,
	};
}

function readable<K extends MapKey>(draft: Draft, key: K): SessionSnapshot[K] {
	return (draft[key] ?? draft.base[key]) as SessionSnapshot[K];
}

function writable<K extends MapKey>(
	draft: Draft,
	key: K,
): NonNullable<Draft[K]> {
	if (!draft[key]) {
		(draft as Record<MapKey, unknown>)[key] = new Map(
			draft.base[key] as ReadonlyMap<string, unknown>,
		);
	}
	return draft[key] as NonNullable<Draft[K]>;
}

function finishDraft(draft: Draft): SessionSnapshot {
	return {
		session: draft.session,
		turns: readable(draft, "turns"),
		items: readable(draft, "items"),
		liveStreams: readable(draft, "liveStreams"),
		cursor: draft.cursor,
		pendingReset: draft.pendingReset,
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

function applyDurable(draft: Draft, event: DurableEvent): void {
	switch (event.type) {
		case "item": {
			writable(draft, "items").set(event.item.id, {
				item: event.item,
				turnId: event.turnId,
			});
			for (const channel of ["text", "tool_input", "terminal"] as const) {
				const key = streamKey(channel, event.item.id);
				if (readable(draft, "liveStreams").has(key)) {
					writable(draft, "liveStreams").delete(key);
				}
			}
			return;
		}
		case "turn": {
			writable(draft, "turns").set(event.turn.id, event.turn);
			return;
		}
		case "session": {
			draft.session = event.session;
			return;
		}
	}
}

function applyEnvelope(draft: Draft, envelope: Envelope): void {
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
		const streams = writable(draft, "liveStreams");
		if (delta.type === "background") {
			streams.set(key, delta.append);
			return;
		}
		const existing = streams.get(key);
		if (existing !== undefined) {
			streams.set(key, existing + delta.append);
			return;
		}
		const stored = readable(draft, "items").get(delta.itemId);
		const base = stored ? snapshotTextFor(delta.type, stored.item) : "";
		streams.set(key, base + delta.append);
	}
}

export function reduceMany(
	prev: SessionSnapshot,
	envelopes: readonly Envelope[],
): SessionSnapshot {
	if (envelopes.length === 0) return prev;
	const draft = startDraft(prev);
	for (const envelope of envelopes) applyEnvelope(draft, envelope);
	return finishDraft(draft);
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
