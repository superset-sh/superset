/**
 * SSR-safe hook for subscribing to TanStack DB collection data.
 *
 * Copied from reference: react-durable-session/use-durable-chat.ts:37-112
 * This is generic and doesn't reference any AI types.
 */

import type { Collection } from "@tanstack/db";
import { useRef, useSyncExternalStore } from "react";

/**
 * Extract the item type from a Collection.
 *
 * TanStack DB's Collection has 5 type parameters:
 * `Collection<T, TKey, TUtils, TSchema, TInsertInput>`
 */
type CollectionItem<C> =
	// biome-ignore lint/suspicious/noExplicitAny: TanStack DB Collection has 5 type params; only T matters here
	C extends Collection<infer T, any, any, any, any> ? T : never;

/**
 * SSR-safe hook for subscribing to TanStack DB collection data.
 * Workaround for useLiveQuery not yet supporting SSR.
 */
export function useCollectionData<
	// biome-ignore lint/suspicious/noExplicitAny: TanStack DB Collection generic constraint
	C extends Collection<any, any, any, any, any>,
>(collection: C): CollectionItem<C>[] {
	type T = CollectionItem<C>;

	// Track version to know when to create a new snapshot.
	const versionRef = useRef(0);

	// Cache the last snapshot to maintain stable reference.
	const snapshotRef = useRef<{ version: number; data: T[] }>({
		version: -1,
		data: [],
	});

	// Subscribe callback — increments version to signal data changed.
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

	// Snapshot callback — returns cached data unless version changed.
	const getSnapshotRef = useRef((): T[] => {
		const currentVersion = versionRef.current;
		const cached = snapshotRef.current;

		if (cached.version === currentVersion) {
			return cached.data;
		}

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

	return useSyncExternalStore(
		subscribeRef.current,
		getSnapshotRef.current,
		getSnapshotRef.current,
	);
}
