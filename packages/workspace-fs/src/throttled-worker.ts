/**
 * Self-contained port of VS Code's `ThrottledWorker`
 * (microsoft/vscode `src/vs/base/common/async.ts`, ~line 1311). Same algorithm,
 * same options shape, same `work(units): boolean` semantics, same `pending`
 * getter. Replaces VS Code's `RunOnceScheduler` / `MutableDisposable` chain
 * with a plain `setTimeout` handle so this stands alone with no base-utility
 * dependencies.
 *
 * Used in workspace-fs to bound the rate at which @parcel/watcher events fan
 * out to listeners, mirroring how VS Code's parcelWatcher protects consumers
 * from event floods (see microsoft/vscode#124723).
 */
export interface ThrottledWorkerOptions {
	/** Maximum units handed to the handler in a single chunk. */
	maxWorkChunkSize: number;
	/** Minimum delay between chunks. */
	throttleDelay: number;
	/**
	 * Maximum units buffered in memory. Past this, `work()` rejects new
	 * batches (returns false). Undefined = unbounded (don't use in
	 * production with untrusted producers).
	 */
	maxBufferedWork: number | undefined;
}

export class ThrottledWorker<T> {
	private readonly pending: T[] = [];
	private throttleTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	constructor(
		private readonly options: ThrottledWorkerOptions,
		private readonly handler: (units: T[]) => void,
	) {}

	get pendingCount(): number {
		return this.pending.length;
	}

	work(units: readonly T[]): boolean {
		if (this.disposed) return false;

		if (typeof this.options.maxBufferedWork === "number") {
			if (this.throttleTimer) {
				if (this.pending.length + units.length > this.options.maxBufferedWork) {
					return false;
				}
			} else if (
				this.pending.length + units.length - this.options.maxWorkChunkSize >
				this.options.maxBufferedWork
			) {
				return false;
			}
		}

		for (const unit of units) this.pending.push(unit);

		if (!this.throttleTimer) {
			this.doWork();
		}

		return true;
	}

	private doWork(): void {
		const chunk = this.pending.splice(0, this.options.maxWorkChunkSize);
		// Drain remaining work even if a handler throws. Without this,
		// one bad listener batch wedges the worker until the next work()
		// call happens to fire. (VS Code's ThrottledWorker has the same
		// bug — async.ts:1351 — relying on process-level uncaughtException
		// handlers to contain the throw, which doesn't unstick the buffer.)
		try {
			if (chunk.length > 0) this.handler(chunk);
		} finally {
			if (!this.disposed && this.pending.length > 0) {
				this.throttleTimer = setTimeout(() => {
					this.throttleTimer = null;
					this.doWork();
				}, this.options.throttleDelay);
				this.throttleTimer.unref?.();
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		if (this.throttleTimer) {
			clearTimeout(this.throttleTimer);
			this.throttleTimer = null;
		}
		this.pending.length = 0;
	}
}
