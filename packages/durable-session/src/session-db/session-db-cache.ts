import type { Collection } from "@tanstack/db";
import type { MessageRow } from "../types";
import { createMessagesCollection } from "./collections/messages";
import {
	createSessionDB,
	type SessionDB,
	type SessionDBConfig,
} from "./session-db";

interface CacheEntry {
	db: SessionDB;
	messagesCollection: Collection<MessageRow>;
	refCount: number;
	preloadPromise: Promise<void>;
	preloaded: boolean;
	cleanupTimer: ReturnType<typeof setTimeout> | null;
}

const cache = new Map<string, CacheEntry>();
const CLEANUP_DELAY_MS = 60 * 60 * 1000; // 1 hour

export function acquireSessionDB(config: SessionDBConfig): {
	db: SessionDB;
	messagesCollection: Collection<MessageRow>;
	preloadPromise: Promise<void>;
	preloaded: boolean;
} {
	const key = config.sessionId;
	const existing = cache.get(key);
	if (existing) {
		existing.refCount++;
		if (existing.cleanupTimer) {
			clearTimeout(existing.cleanupTimer);
			existing.cleanupTimer = null;
		}
		return {
			db: existing.db,
			messagesCollection: existing.messagesCollection,
			preloadPromise: existing.preloadPromise,
			preloaded: existing.preloaded,
		};
	}

	const db = createSessionDB(config);
	const messagesCollection = createMessagesCollection({
		chunksCollection: db.collections.chunks,
	});
	const entry: CacheEntry = {
		db,
		messagesCollection,
		refCount: 1,
		preloadPromise: undefined as unknown as Promise<void>,
		preloaded: false,
		cleanupTimer: null,
	};
	entry.preloadPromise = db.preload().then(() => {
		entry.preloaded = true;
	});
	cache.set(key, entry);
	return {
		db,
		messagesCollection,
		preloadPromise: entry.preloadPromise,
		preloaded: false,
	};
}

export function releaseSessionDB(sessionId: string): void {
	const entry = cache.get(sessionId);
	if (!entry) return;
	entry.refCount--;
	if (entry.refCount <= 0) {
		entry.cleanupTimer = setTimeout(() => {
			entry.db.close();
			cache.delete(sessionId);
		}, CLEANUP_DELAY_MS);
	}
}
