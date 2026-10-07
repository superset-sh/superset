import { TRPCError } from "@trpc/server";

interface Entry<T> {
	promise: Promise<T>;
	expiresAt: number | null;
	bytes: number;
}
interface CacheOptions<T> {
	now?: () => number;
	ttlMs?: number;
	maxEntries?: number;
	maxBytes?: number;
	size?: (value: T) => number;
}
export class GitLabReadCache<T> {
	private readonly entries = new Map<string, Entry<T>>();
	private readonly now: () => number;
	private readonly ttlMs: number;
	private readonly maxEntries: number;
	private readonly maxBytes: number;
	private readonly measure: (value: T) => number;
	constructor(options: CacheOptions<T> = {}) {
		this.now = options.now ?? (() => Date.now());
		this.ttlMs = options.ttlMs ?? 30_000;
		this.maxEntries = options.maxEntries ?? 128;
		this.maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
		this.measure =
			options.size ?? ((value) => Buffer.byteLength(JSON.stringify(value)));
	}
	get size() {
		return this.entries.size;
	}
	delete(key: string) {
		this.entries.delete(key);
	}
	private trim(reserve = 0) {
		const now = this.now();
		for (const [key, entry] of this.entries)
			if (entry.expiresAt !== null && entry.expiresAt <= now)
				this.entries.delete(key);
		let bytes = [...this.entries.values()].reduce(
			(total, entry) => total + entry.bytes,
			0,
		);
		for (const [key, entry] of this.entries) {
			if (
				this.entries.size + reserve <= this.maxEntries &&
				bytes <= this.maxBytes
			)
				break;
			if (entry.expiresAt !== null) {
				this.entries.delete(key);
				bytes -= entry.bytes;
			}
		}
	}
	read(key: string, read: () => Promise<T>): Promise<T> {
		this.trim();
		const cached = this.entries.get(key);
		if (cached) return cached.promise;
		this.trim(1);
		if (this.entries.size >= this.maxEntries)
			return Promise.reject(
				new TRPCError({
					code: "SERVICE_UNAVAILABLE",
					message: "Too many GitLab reads are pending. Retry shortly.",
				}),
			);
		const entry: Entry<T> = {
			promise: Promise.resolve().then(read),
			expiresAt: null,
			bytes: 0,
		};
		this.entries.set(key, entry);
		entry.promise.then(
			(value) => {
				if (this.entries.get(key) !== entry) return;
				entry.bytes = this.measure(value);
				entry.expiresAt = this.now() + this.ttlMs;
				if (entry.bytes > this.maxBytes) this.entries.delete(key);
				this.trim();
			},
			() => {
				if (this.entries.get(key) === entry) this.entries.delete(key);
			},
		);
		return entry.promise;
	}
}
