/**
 * Write-debouncing wrapper around a storage-like object (localStorage,
 * sessionStorage, or an in-memory stand-in).
 *
 * - Reads go straight through.
 * - Writes are coalesced per key with the given debounce window and
 *   flushed on `flush()` (called from `beforeunload`).
 *
 * Ported from t3code's createDebouncedStorage
 * (temp/t3code/apps/web/src/lib/storage.ts).
 */

export interface SimpleStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface DebouncedStorage extends SimpleStorage {
	flush(): void;
}

export function createDebouncedStorage(
	underlying: SimpleStorage,
	debounceMs: number,
): DebouncedStorage {
	type Pending =
		| { kind: "set"; value: string }
		| { kind: "remove" };
	const pending = new Map<string, Pending>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	const commit = (key: string) => {
		const entry = pending.get(key);
		pending.delete(key);
		const timer = timers.get(key);
		if (timer) clearTimeout(timer);
		timers.delete(key);
		if (!entry) return;
		if (entry.kind === "set") underlying.setItem(key, entry.value);
		else underlying.removeItem(key);
	};

	const schedule = (key: string) => {
		const existing = timers.get(key);
		if (existing) clearTimeout(existing);
		timers.set(
			key,
			setTimeout(() => commit(key), debounceMs),
		);
	};

	return {
		getItem: (key) => {
			const p = pending.get(key);
			if (p?.kind === "set") return p.value;
			if (p?.kind === "remove") return null;
			return underlying.getItem(key);
		},
		setItem: (key, value) => {
			pending.set(key, { kind: "set", value });
			schedule(key);
		},
		removeItem: (key) => {
			pending.set(key, { kind: "remove" });
			schedule(key);
		},
		flush: () => {
			for (const key of Array.from(pending.keys())) commit(key);
		},
	};
}

export function createMemoryStorage(): SimpleStorage {
	const map = new Map<string, string>();
	return {
		getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key),
	};
}
