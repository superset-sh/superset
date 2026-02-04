/**
 * SSR-safe hook for subscribing to TanStack DB collection data.
 *
 * Copied verbatim from @electric-sql/react-durable-session.
 * This is a workaround to useLiveQuery not yet supporting SSR
 * as per https://github.com/TanStack/db/pull/709
 */

import type { Collection } from "@tanstack/db";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Extract the item type from a Collection.
 *
 * TanStack DB's Collection has 5 type parameters:
 * `Collection<T, TKey, TUtils, TSchema, TInsertInput>`
 *
 * This helper extracts `T` (the item type) from any Collection variant.
 */
type CollectionItem<C> =
	// biome-ignore lint/suspicious/noExplicitAny: Collection has constrained generic params that require any
	C extends Collection<infer T, any, any, any, any> ? T : never;

/**
 * SSR-safe hook for subscribing to TanStack DB collection data.
 * This is a workaround to useLiveQuery not yet supporting SSR
 * as per https://github.com/TanStack/db/pull/709
 */
export function useCollectionData<
	// biome-ignore lint/suspicious/noExplicitAny: Collection has constrained generic params that require any
	C extends Collection<any, any, any, any, any>,
>(collection: C): CollectionItem<C>[] {
	type T = CollectionItem<C>;

	const collectionRef = useRef(collection);

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

	useEffect(() => {
		collectionRef.current = collection;
		versionRef.current = 0;
		snapshotRef.current = { version: -1, data: [] };
	}, [collection]);

	// Subscribe callback - increments version to signal data changed.
	// Stored in ref to maintain stable reference for useSyncExternalStore.
	const subscribeRef = useRef<(onStoreChange: () => void) => () => void>(
		() => () => {},
	);
	subscribeRef.current = (onStoreChange: () => void): (() => void) => {
		const currentCollection = collectionRef.current;
		const subscription = currentCollection.subscribeChanges(() => {
			versionRef.current++;
			console.log(
				`[ai-chat/collection] change detected, version=${versionRef.current}, size=${currentCollection.size}`,
			);
			onStoreChange();
		});
		return () => subscription.unsubscribe();
	};

	// Snapshot callback - returns cached data unless version changed.
	// Stored in ref to maintain stable reference for useSyncExternalStore.
	const getSnapshotRef = useRef<() => T[]>(() => []);
	getSnapshotRef.current = (): T[] => {
		const currentVersion = versionRef.current;
		const cached = snapshotRef.current;

		if (cached.version === currentVersion) {
			return cached.data;
		}

		const data = [...collectionRef.current.values()] as T[];
		snapshotRef.current = { version: currentVersion, data };
		return data;
	};

	const getServerSnapshotRef = useRef<() => T[]>(() => []);
	getServerSnapshotRef.current = (): T[] => snapshotRef.current.data;

	// Use a stable server snapshot to keep SSR output consistent
	// and avoid hydration mismatches.
	return useSyncExternalStore(
		subscribeRef.current,
		getSnapshotRef.current,
		getServerSnapshotRef.current,
	);
}
