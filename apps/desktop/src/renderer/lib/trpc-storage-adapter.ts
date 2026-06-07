import type { StateStorage } from "zustand/middleware";

/**
 * Pure tRPC-backed Zustand storage adapter. Extracted from trpc-storage.ts so
 * it can be unit-tested without importing the electron tRPC client.
 */

export interface TrpcStorageConfig {
	get: () => Promise<unknown>;
	set: (input: unknown) => Promise<unknown>;
	writeDebounceMs?: number;
	/**
	 * When this returns true, drop the write instead of persisting it.
	 * Used while applying remote (cross-window) state: the originating window
	 * already persisted it, and echoing it back would loop the broadcast.
	 */
	shouldSuppressWrite?: () => boolean;
}

const PENDING_SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const LOCAL_SNAPSHOT_WRITE_DEBOUNCE_MS = 250;

export function createTrpcStorageAdapter(
	config: TrpcStorageConfig,
): StateStorage {
	const debounceMs = config.writeDebounceMs ?? 0;
	let pendingValue: string | null = null;
	let lastFlushedValue: string | null = null;
	let flushTimer: ReturnType<typeof setTimeout> | null = null;
	let isFlushing = false;
	let pendingSnapshotValue: string | null = null;
	let pendingSnapshotTimer: ReturnType<typeof setTimeout> | null = null;

	const getPendingSnapshotKey = (name: string) => `${name}:pending`;
	const getPendingSnapshotUpdatedAtKey = (name: string) =>
		`${name}:pending:updatedAt`;
	const pendingSnapshotDebounceMs =
		debounceMs > 0
			? Math.min(debounceMs, LOCAL_SNAPSHOT_WRITE_DEBOUNCE_MS)
			: LOCAL_SNAPSHOT_WRITE_DEBOUNCE_MS;

	const clearPendingSnapshot = (name: string, expectedValue?: string): void => {
		try {
			const pendingKey = getPendingSnapshotKey(name);
			if (
				expectedValue !== undefined &&
				localStorage.getItem(pendingKey) !== expectedValue
			) {
				return;
			}
			localStorage.removeItem(pendingKey);
			localStorage.removeItem(getPendingSnapshotUpdatedAtKey(name));
		} catch (error) {
			console.error("[trpc-storage] Failed to clear pending snapshot:", error);
		}
	};

	const schedulePendingSnapshotPersist = (
		name: string,
		snapshot: string,
	): void => {
		pendingSnapshotValue = snapshot;

		if (pendingSnapshotTimer) {
			clearTimeout(pendingSnapshotTimer);
			pendingSnapshotTimer = null;
		}

		pendingSnapshotTimer = setTimeout(() => {
			pendingSnapshotTimer = null;
			const valueToPersist = pendingSnapshotValue;
			pendingSnapshotValue = null;
			if (!valueToPersist) return;

			try {
				localStorage.setItem(getPendingSnapshotKey(name), valueToPersist);
				localStorage.setItem(
					getPendingSnapshotUpdatedAtKey(name),
					String(Date.now()),
				);
			} catch (error) {
				console.error(
					"[trpc-storage] Failed to cache pending snapshot in localStorage:",
					error,
				);
			}
		}, pendingSnapshotDebounceMs);
	};

	const scheduleImmediateFlush = (name: string, snapshot: string): void => {
		// Ensure pending snapshot eventually syncs to appState.
		if (pendingValue === null) {
			pendingValue = snapshot;
		}
		if (!isFlushing && flushTimer === null) {
			flushTimer = setTimeout(() => {
				flushTimer = null;
				void flushPendingWrite(name);
			}, 0);
		}
	};

	const flushPendingWrite = async (name: string): Promise<void> => {
		if (isFlushing || pendingValue === null) return;
		const valueToFlush = pendingValue;
		pendingValue = null;

		if (valueToFlush === lastFlushedValue) {
			return;
		}

		isFlushing = true;
		try {
			const parsed = JSON.parse(valueToFlush) as {
				state: unknown;
				version: number;
			};
			// Persist version in localStorage, bare state via tRPC.
			localStorage.setItem(`${name}:version`, String(parsed.version));
			await config.set(parsed.state);
			lastFlushedValue = valueToFlush;

			// Cancel delayed snapshot write if this exact snapshot was already flushed.
			if (pendingSnapshotValue === valueToFlush && pendingSnapshotTimer) {
				clearTimeout(pendingSnapshotTimer);
				pendingSnapshotTimer = null;
				pendingSnapshotValue = null;
			}
			clearPendingSnapshot(name, valueToFlush);
		} catch (error) {
			console.error("[trpc-storage] Failed to set state:", error);
		} finally {
			isFlushing = false;
			if (pendingValue !== null) {
				if (debounceMs > 0) {
					flushTimer = setTimeout(() => {
						flushTimer = null;
						void flushPendingWrite(name);
					}, debounceMs);
				} else {
					void flushPendingWrite(name);
				}
			}
		}
	};

	return {
		getItem: async (name: string): Promise<string | null> => {
			try {
				const state = await config.get();
				const version = Number.parseInt(
					localStorage.getItem(`${name}:version`) ?? "0",
					10,
				);
				const canonicalSnapshot = state
					? JSON.stringify({ state, version })
					: null;

				const pendingSnapshot = localStorage.getItem(
					getPendingSnapshotKey(name),
				);
				const pendingUpdatedAt = Number.parseInt(
					localStorage.getItem(getPendingSnapshotUpdatedAtKey(name)) ?? "0",
					10,
				);
				const pendingAgeMs =
					Number.isFinite(pendingUpdatedAt) && pendingUpdatedAt > 0
						? Date.now() - pendingUpdatedAt
						: Number.POSITIVE_INFINITY;
				const isPendingFresh = pendingAgeMs <= PENDING_SNAPSHOT_TTL_MS;

				if (pendingSnapshot) {
					if (!canonicalSnapshot) {
						if (isPendingFresh) {
							scheduleImmediateFlush(name, pendingSnapshot);
							return pendingSnapshot;
						}
						clearPendingSnapshot(name);
						return null;
					}

					if (pendingSnapshot === canonicalSnapshot) {
						clearPendingSnapshot(name);
						return canonicalSnapshot;
					}

					// Only trust pending snapshots that are very recent; otherwise
					// canonical appState remains the source of truth.
					if (isPendingFresh) {
						scheduleImmediateFlush(name, pendingSnapshot);
						return pendingSnapshot;
					}

					clearPendingSnapshot(name);
					return canonicalSnapshot;
				}

				return canonicalSnapshot;
			} catch (error) {
				console.error("[trpc-storage] Failed to get state:", error);
				return null;
			}
		},
		setItem: async (name: string, value: string): Promise<void> => {
			if (config.shouldSuppressWrite?.()) {
				// Remote-originated state: the writer window already persisted it.
				// Record it as flushed so an identical local write is skipped too,
				// and cancel any pre-merge local write still sitting in the
				// debounce window — flushing it after the merge would persist and
				// re-broadcast stale state (e.g. resurrect a remotely-closed tab).
				lastFlushedValue = value;
				pendingValue = null;
				if (flushTimer) {
					clearTimeout(flushTimer);
					flushTimer = null;
				}
				if (pendingSnapshotTimer) {
					clearTimeout(pendingSnapshotTimer);
					pendingSnapshotTimer = null;
				}
				pendingSnapshotValue = null;
				clearPendingSnapshot(name);
				return;
			}
			if (value === pendingValue || value === lastFlushedValue) {
				return;
			}

			pendingValue = value;
			schedulePendingSnapshotPersist(name, value);
			if (flushTimer) {
				clearTimeout(flushTimer);
				flushTimer = null;
			}

			if (debounceMs > 0) {
				flushTimer = setTimeout(() => {
					flushTimer = null;
					void flushPendingWrite(name);
				}, debounceMs);
			} else {
				void flushPendingWrite(name);
			}
		},
		removeItem: async (_name: string): Promise<void> => {
			// Reset to empty/default state is handled by the store itself
			// No-op here as we don't want to delete persisted state
		},
	};
}
