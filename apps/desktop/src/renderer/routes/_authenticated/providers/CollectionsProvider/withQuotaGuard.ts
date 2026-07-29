/**
 * `@tanstack/db`'s `localStorageCollectionOptions` re-serializes the whole
 * collection on every mutation and rethrows `QuotaExceededError`. The library
 * treats that throw as a failed transaction and rolls the optimistic write
 * back, which makes the live query re-emit, which makes the effect that queued
 * the write queue it again — a synchronous retry loop that pegs the renderer
 * and survives restarts, because the full store is on disk.
 *
 * This wrapper installs a `storage` whose `setItem` absorbs that failure:
 * reclaim space, retry once, and if it still cannot land, return normally. Not
 * throwing is the fix — no throw means no rollback, so the loop cannot form at
 * any of the ~15 sites that write to these collections. The cost is that memory
 * and disk disagree until the next launch, which is strictly better than an
 * app that has to be recovered by deleting a folder in Finder.
 *
 * Reclaim is injected rather than implemented here so this stays ignorant of
 * what is worth deleting; see `selectOrphanedTerminalSnapshots`.
 */

/** The slice of `Storage` the library actually calls. */
export interface QuotaGuardStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface QuotaGuardHandlers {
	/** Frees space and reports how many keys it removed; 0 skips the retry. */
	reclaim: () => number;
	/** Called when a write is abandoned, once the retry has also failed. */
	onPersistFailed: (storageKey: string, error: unknown) => void;
	/** Defaults to `window.localStorage`; overridden in tests. */
	storage?: QuotaGuardStorage;
}

/**
 * Chromium reports exhaustion as `QuotaExceededError`; older WebKit and Firefox
 * builds use a numeric code or their own name. Anything else is a genuine
 * defect and is rethrown, so this never masks unrelated storage failures.
 */
function isQuotaExceeded(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const legacyCode = (error as DOMException).code;
	return (
		error.name === "QuotaExceededError" ||
		error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
		legacyCode === 22 ||
		legacyCode === 1014
	);
}

function guardStorage(
	base: QuotaGuardStorage,
	{ reclaim, onPersistFailed }: QuotaGuardHandlers,
): QuotaGuardStorage {
	return {
		getItem: (key) => base.getItem(key),
		removeItem: (key) => {
			base.removeItem(key);
		},
		setItem: (key, value) => {
			try {
				base.setItem(key, value);
				return;
			} catch (error) {
				if (!isQuotaExceeded(error)) throw error;
				if (reclaim() === 0) {
					onPersistFailed(key, error);
					return;
				}
			}
			try {
				base.setItem(key, value);
			} catch (retryError) {
				if (!isQuotaExceeded(retryError)) throw retryError;
				onPersistFailed(key, retryError);
			}
		},
	};
}

/**
 * Wrap `localStorageCollectionOptions` input so quota exhaustion degrades to a
 * dropped write instead of a rollback loop. Composes with `withReadHeal`, and
 * respects a `storage` already present on the options so tests keep control of
 * the backing store.
 */
export function withQuotaGuard<T>(options: T, handlers: QuotaGuardHandlers): T {
	const base =
		handlers.storage ??
		(options as { storage?: QuotaGuardStorage }).storage ??
		window.localStorage;
	return { ...options, storage: guardStorage(base, handlers) } as T;
}
