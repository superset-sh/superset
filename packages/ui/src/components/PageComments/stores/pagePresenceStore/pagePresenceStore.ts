import type { PageCursor } from "@superset/shared/page-presence";
import {
	openPagePresence,
	type PagePresenceClient,
	type PagePresenceState,
} from "@superset/shared/page-presence-client";
import { useCallback, useSyncExternalStore } from "react";

interface Room {
	client: PagePresenceClient;
	state: PagePresenceState;
	holders: number;
}

const EMPTY: PagePresenceState = { viewers: [], cursors: new Map() };
const rooms = new Map<string, Room>();
const listeners = new Set<() => void>();

const notify = () => {
	for (const listener of listeners) listener();
};

export function joinPagePresence(
	pageId: string,
	url: () => Promise<string | null>,
): () => void {
	let room = rooms.get(pageId);
	if (!room) {
		const created = { state: EMPTY, holders: 0 } as Room;
		created.client = openPagePresence({
			url,
			onChange: (state) => {
				created.state = state;
				notify();
			},
		});
		rooms.set(pageId, created);
		room = created;
	}
	const joined = room;
	joined.holders += 1;
	return () => {
		joined.holders -= 1;
		if (joined.holders > 0) return;
		joined.client.stop();
		rooms.delete(pageId);
		notify();
	};
}

export function setPagePointer(pageId: string, cursor: PageCursor | null) {
	rooms.get(pageId)?.client.setCursor(cursor);
}

export function wakePagePresence() {
	for (const room of rooms.values()) room.client.wake();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function usePagePresence(pageId: string | undefined): PagePresenceState {
	const read = useCallback(
		() => (pageId ? (rooms.get(pageId)?.state ?? EMPTY) : EMPTY),
		[pageId],
	);
	return useSyncExternalStore(subscribe, read, () => EMPTY);
}
