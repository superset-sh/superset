/**
 * SSR-safe hook for subscribing to TanStack DB collection data.
 *
 * Copied verbatim from @electric-sql/react-durable-session.
 * This is a workaround to useLiveQuery not yet supporting SSR
 * as per https://github.com/TanStack/db/pull/709
 */

import type { Collection } from "@tanstack/db";
import { useRef, useSyncExternalStore } from "react";

/**
 * Extract the item type from a Collection.
 *
 * TanStack DB's Collection has 5 type parameters:
 * `Collection<T, TKey, TUtils, TSchema, TInsertInput>`
 *
 * This helper extracts `T` (the item type) from any Collection variant.
 */
type CollectionItem<C> =
	C extends Collection<infer T, any, any, any, any> ? T : never;

/**
 * SSR-safe hook for subscribing to TanStack DB collection data.
 * This is a workaround to useLiveQuery not yet supporting SSR
 * as per https://github.com/TanStack/db/pull/709
 */
export function useCollectionData<
	C extends Collection<any, any, any, any, any>,
>(collection: C): CollectionItem<C>[] {
	type T = CollectionItem<C>;

	// Track version to know when to create a new snapshot.
	// Incremented by subscription callback when collection changes.
	const versionRef = useRef(0);

	// Cache the last snapshot to maintain stable reference.
	// useSyncExternalStore requires getSnapshot to return the same reference
	// when data hasn't changed, otherwise it triggers infinite re-renders.
	const snapshotRef = useRef<{ version: number; data: T[] }>({
		version: -1, // Force initial snapshot creation
		data: [],
	});

	// Subscribe callback - increments version to signal data changed.
	// Stored in ref to maintain stable reference for useSyncExternalStore.
	const subscribeRef = useRef((onStoreChange: () => void): (() => void) => {
		const subscription = collection.subscribeChanges(() => {
			versionRef.current++;
			onStoreChange();
		});
		return () => subscription.unsubscribe();
	});

	// Update subscribe ref when collection changes
	subscribeRef.current = (onStoreChange: () => void): (() => void) => {
		const subscription = collection.subscribeChanges(() => {
			versionRef.current++;
			onStoreChange();
		});
		return () => subscription.unsubscribe();
	};

	// Snapshot callback - returns cached data unless version changed.
	// Stored in ref to maintain stable reference for useSyncExternalStore.
	const getSnapshotRef = useRef((): T[] => {
		const currentVersion = versionRef.current;
		const cached = snapshotRef.current;

		// Return cached snapshot if version hasn't changed
		if (cached.version === currentVersion) {
			return cached.data;
		}

		// Version changed - create new snapshot and cache it
		const data = [...collection.values()] as T[];
		snapshotRef.current = { version: currentVersion, data };
		return data;
	});

	// Update getSnapshot ref when collection changes
	getSnapshotRef.current = (): T[] => {
		const currentVersion = versionRef.current;
		const cached = snapshotRef.current;

		if (cached.version === currentVersion) {
			return cached.data;
		}

		const data = [...collection.values()] as T[];
		snapshotRef.current = { version: currentVersion, data };
		return data;
	};

	// Pass the same function for both getSnapshot and getServerSnapshot.
	// This ensures server and client render the same initial state (empty array),
	// preventing hydration mismatches while enabling proper SSR.
	return useSyncExternalStore(
		subscribeRef.current,
		getSnapshotRef.current,
		getSnapshotRef.current,
	);
}
