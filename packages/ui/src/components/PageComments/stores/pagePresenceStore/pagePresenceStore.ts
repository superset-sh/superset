"use client";

import type { PagePresenceViewer } from "@superset/shared/page-presence";
import {
	openPagePresence,
	type PagePresenceClient,
} from "@superset/shared/page-presence-client";
import { useCallback, useSyncExternalStore } from "react";

interface Room {
	client: PagePresenceClient;
	viewers: PagePresenceViewer[];
	holders: number;
}

const NONE: PagePresenceViewer[] = [];
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
		const created = { viewers: NONE, holders: 0 } as Room;
		created.client = openPagePresence({
			url,
			onViewers: (viewers) => {
				created.viewers = viewers;
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

export function wakePagePresence() {
	for (const room of rooms.values()) room.client.wake();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function usePageViewers(
	pageId: string | undefined,
): PagePresenceViewer[] {
	const read = useCallback(
		() => (pageId ? (rooms.get(pageId)?.viewers ?? NONE) : NONE),
		[pageId],
	);
	return useSyncExternalStore(subscribe, read, () => NONE);
}
