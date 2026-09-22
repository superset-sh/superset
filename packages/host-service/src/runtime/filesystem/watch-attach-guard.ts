import path from "node:path";
import type { FsWatcherManager } from "@superset/workspace-fs/host";

type WatchAttacher = Pick<FsWatcherManager, "subscribe" | "close">;

const INITIAL_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;

// FsWatcherManager rejects with this prefix when it refuses a path before
// handing it to the native backend (missing root, not a directory, no inotify).
const REJECTED_BEFORE_NATIVE_PREFIX = "Cannot watch path:";

export class WatchAttachBackoffError extends Error {
	readonly retryAt: number;

	constructor(absolutePath: string, retryAt: number, cause: string) {
		super(
			`Watch attach backing off until ${new Date(retryAt).toISOString()}: ${absolutePath} (${cause})`,
		);
		this.name = "WatchAttachBackoffError";
		this.retryAt = retryAt;
	}
}

interface AttachFailure {
	count: number;
	retryAt: number;
	cause: string;
}

export interface WatchAttachGuardOptions {
	initialBackoffMs?: number;
	maxBackoffMs?: number;
	now?: () => number;
}

/**
 * Two callers attaching one root at once each create a watcher for it and the
 * loser's is never released, so attaches for a root run one at a time. And a
 * root whose native attach failed is not handed to the native layer again
 * until its backoff elapses: GitWatcher's rescan would otherwise retry it
 * every 30s forever, each retry a full crawl of the worktree.
 */
export class WatchAttachGuard implements WatchAttacher {
	private readonly inner: WatchAttacher;
	private readonly initialBackoffMs: number;
	private readonly maxBackoffMs: number;
	private readonly now: () => number;
	private readonly failures = new Map<string, AttachFailure>();
	private readonly attachQueues = new Map<string, Promise<void>>();

	constructor(inner: WatchAttacher, options: WatchAttachGuardOptions = {}) {
		this.inner = inner;
		this.initialBackoffMs = options.initialBackoffMs ?? INITIAL_BACKOFF_MS;
		this.maxBackoffMs = options.maxBackoffMs ?? MAX_BACKOFF_MS;
		this.now = options.now ?? Date.now;
	}

	isBackingOff(absolutePath: string): boolean {
		const failure = this.failures.get(path.resolve(absolutePath));
		return failure !== undefined && this.now() < failure.retryAt;
	}

	subscribe: WatchAttacher["subscribe"] = async (options, listener) => {
		const key = path.resolve(options.absolutePath);
		const previous = this.attachQueues.get(key) ?? Promise.resolve();
		let release: () => void = () => {};
		const attachSettled = new Promise<void>((resolve) => {
			release = resolve;
		});
		const tail = previous.then(() => attachSettled);
		this.attachQueues.set(key, tail);
		await previous;

		try {
			const failure = this.failures.get(key);
			if (failure && this.now() < failure.retryAt) {
				throw new WatchAttachBackoffError(key, failure.retryAt, failure.cause);
			}
			const unsubscribe = await this.inner.subscribe(options, listener);
			this.failures.delete(key);
			return unsubscribe;
		} catch (error) {
			if (!(error instanceof WatchAttachBackoffError)) {
				this.recordFailure(key, error);
			}
			throw error;
		} finally {
			release();
			if (this.attachQueues.get(key) === tail) {
				this.attachQueues.delete(key);
			}
		}
	};

	async close(): Promise<void> {
		this.failures.clear();
		await this.inner.close();
	}

	private recordFailure(key: string, error: unknown): void {
		const cause = error instanceof Error ? error.message : String(error);
		if (cause.startsWith(REJECTED_BEFORE_NATIVE_PREFIX)) {
			return;
		}
		const count = (this.failures.get(key)?.count ?? 0) + 1;
		const delayMs = Math.min(
			this.initialBackoffMs * 2 ** (count - 1),
			this.maxBackoffMs,
		);
		this.failures.set(key, { count, retryAt: this.now() + delayMs, cause });
		console.error("[watch-attach-guard] native watch attach failed:", {
			absolutePath: key,
			failures: count,
			retryInMs: delayMs,
			error: cause,
		});
	}
}
