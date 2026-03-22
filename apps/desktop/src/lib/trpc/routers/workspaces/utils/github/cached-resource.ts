interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

export interface CacheState<T> {
	value: T;
	isFresh: boolean;
}

interface InFlightEntry<T> {
	promise: Promise<T>;
	requestId: number;
}

export interface CachedResourceReadOptions<T> {
	forceFresh?: boolean;
	shouldCache?: (value: T) => boolean;
}

export interface CachedResource<T> {
	get: (cacheKey: string) => T | null;
	getState: (cacheKey: string) => CacheState<T> | null;
	set: (cacheKey: string, value: T) => void;
	read: (
		cacheKey: string,
		load: () => Promise<T>,
		options?: CachedResourceReadOptions<T>,
	) => Promise<T>;
	invalidate: (cacheKey: string) => void;
	invalidatePrefix: (cacheKeyPrefix: string) => void;
}

export function createCachedResource<T>({
	ttlMs,
	maxEntries,
}: {
	ttlMs: number;
	maxEntries: number;
}): CachedResource<T> {
	const cache = new Map<string, CacheEntry<T>>();
	const inFlight = new Map<string, InFlightEntry<T>>();
	const requestIds = new Map<string, number>();
	let nextRequestId = 0;

	function getState(cacheKey: string): CacheState<T> | null {
		const cached = cache.get(cacheKey);
		if (!cached) {
			return null;
		}

		return {
			value: cached.value,
			isFresh: cached.expiresAt > Date.now(),
		};
	}

	function set(cacheKey: string, value: T): void {
		if (!cache.has(cacheKey) && cache.size >= maxEntries) {
			cache.clear();
		}

		cache.set(cacheKey, {
			value,
			expiresAt: Date.now() + ttlMs,
		});
	}

	function invalidate(cacheKey: string): void {
		cache.delete(cacheKey);
		inFlight.delete(cacheKey);
		requestIds.delete(cacheKey);
	}

	function invalidatePrefix(cacheKeyPrefix: string): void {
		for (const cacheKey of cache.keys()) {
			if (cacheKey.startsWith(cacheKeyPrefix)) {
				cache.delete(cacheKey);
			}
		}

		for (const cacheKey of inFlight.keys()) {
			if (cacheKey.startsWith(cacheKeyPrefix)) {
				inFlight.delete(cacheKey);
			}
		}

		for (const cacheKey of requestIds.keys()) {
			if (cacheKey.startsWith(cacheKeyPrefix)) {
				requestIds.delete(cacheKey);
			}
		}
	}

	function startLoad(
		cacheKey: string,
		load: () => Promise<T>,
		shouldCache: (value: T) => boolean,
	): Promise<T> {
		const requestId = ++nextRequestId;
		requestIds.set(cacheKey, requestId);

		const promise = (async () => {
			try {
				const value = await load();
				if (requestIds.get(cacheKey) === requestId) {
					if (shouldCache(value)) {
						set(cacheKey, value);
					} else {
						cache.delete(cacheKey);
					}
				}

				return value;
			} finally {
				const current = inFlight.get(cacheKey);
				if (current?.requestId === requestId) {
					inFlight.delete(cacheKey);
				}

				if (requestIds.get(cacheKey) === requestId) {
					requestIds.delete(cacheKey);
				}
			}
		})();

		inFlight.set(cacheKey, { promise, requestId });
		return promise;
	}

	async function read(
		cacheKey: string,
		load: () => Promise<T>,
		options?: CachedResourceReadOptions<T>,
	): Promise<T> {
		const shouldCache = options?.shouldCache ?? (() => true);
		const currentInFlight = inFlight.get(cacheKey)?.promise ?? null;
		if (options?.forceFresh) {
			return currentInFlight ?? startLoad(cacheKey, load, shouldCache);
		}

		const cached = getState(cacheKey);
		if (cached?.isFresh) {
			return cached.value;
		}

		if (cached) {
			if (!currentInFlight) {
				startLoad(cacheKey, load, shouldCache).catch((error) => {
					console.warn("[GitHub] Background cache refresh failed:", error);
				});
			}

			return cached.value;
		}

		return currentInFlight ?? startLoad(cacheKey, load, shouldCache);
	}

	return {
		get: (cacheKey) => {
			const cached = getState(cacheKey);
			return cached?.isFresh ? cached.value : null;
		},
		getState,
		set,
		read,
		invalidate,
		invalidatePrefix,
	};
}
