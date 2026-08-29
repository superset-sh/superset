interface PersistedStore {
	persist: {
		getOptions: () => { name?: string };
		rehydrate: () => Promise<void> | void;
	};
}

interface StorageEventTarget {
	addEventListener: (
		type: "storage",
		listener: (event: StorageEvent) => void,
	) => void;
	removeEventListener: (
		type: "storage",
		listener: (event: StorageEvent) => void,
	) => void;
}

/**
 * Keeps a Zustand persist store current when another renderer writes its
 * localStorage key. Zustand hydrates on startup but does not subscribe to
 * storage events itself.
 *
 * This follows Zustand's documented cross-tab synchronization recipe. The
 * returned cleanup also prevents duplicate listeners during renderer HMR.
 */
export function syncPersistedStoreAcrossWindows(
	store: PersistedStore,
	eventTarget: StorageEventTarget = window,
): () => void {
	const handleStorage = (event: StorageEvent) => {
		if (
			event.key !== store.persist.getOptions().name ||
			event.newValue === null
		) {
			return;
		}

		void store.persist.rehydrate();
	};

	eventTarget.addEventListener("storage", handleStorage);
	return () => eventTarget.removeEventListener("storage", handleStorage);
}
