import type { IPty } from "node-pty";

/**
 * A write queue for PTY that reduces event loop starvation.
 *
 * Context: This is used in the non-daemon (in-process) terminal mode.
 * For daemon mode, the real backpressure handling (EAGAIN retry with backoff)
 * is implemented in pty-subprocess.ts.
 *
 * Problem: node-pty's write() is synchronous. While the kernel buffer rarely
 * fills completely, processing large pastes in a single event loop tick can
 * starve other work (IPC handlers, UI updates).
 *
 * Solution: Queue writes and process them in small chunks, yielding to the
 * event loop between chunks via setTimeout. This improves responsiveness
 * during large pastes.
 *
 * Limitations:
 * - Does NOT handle true kernel-level backpressure (EAGAIN/EWOULDBLOCK)
 * - If node-pty.write() blocks, this cannot prevent it
 * - For robust backpressure handling, use daemon mode with subprocess isolation
 *
 * Features:
 * - Chunked writes to reduce event loop starvation
 * - Memory-bounded queue to prevent OOM
 * - Backpressure signaling when queue is full
 * - Graceful handling of PTY closure
 */
export class PtyWriteQueue {
	private queue: string[] = [];
	private queuedBytes = 0;
	private flushing = false;
	private disposed = false;

	/**
	 * Size of each write chunk. Smaller = more responsive but slower throughput.
	 * 256 bytes keeps individual blocks short (~1-5ms typically).
	 */
	private readonly CHUNK_SIZE = 256;

	/**
	 * Delay between chunks in ms. Gives event loop time to process other work.
	 */
	private readonly CHUNK_DELAY_MS = 1;

	/**
	 * Maximum bytes allowed in queue. Prevents OOM if PTY stops consuming.
	 * 1MB is generous - a typical large paste is ~50KB.
	 */
	private readonly MAX_QUEUE_BYTES = 1_000_000;

	constructor(
		private pty: IPty,
		private onDrain?: () => void,
	) {}

	/**
	 * Queue data to be written to the PTY.
	 * @returns true if queued, false if queue is full (backpressure)
	 */
	write(data: string): boolean {
		if (this.disposed) {
			return false;
		}

		if (this.queuedBytes + data.length > this.MAX_QUEUE_BYTES) {
			console.warn(
				`[PtyWriteQueue] Queue full (${this.queuedBytes} bytes), rejecting write of ${data.length} bytes`,
			);
			return false;
		}

		this.queue.push(data);
		this.queuedBytes += data.length;
		this.scheduleFlush();
		return true;
	}

	/**
	 * Schedule the flush loop if not already running.
	 */
	private scheduleFlush(): void {
		if (this.flushing || this.disposed) return;
		this.flushing = true;
		setTimeout(() => this.flush(), 0);
	}

	/**
	 * Process one chunk from the queue and schedule the next.
	 */
	private flush(): void {
		if (this.disposed) {
			this.flushing = false;
			return;
		}

		if (this.queue.length === 0) {
			this.flushing = false;
			this.onDrain?.();
			return;
		}

		// Take a chunk from front of queue
		let chunk = this.queue[0];
		if (chunk.length > this.CHUNK_SIZE) {
			// Split: take CHUNK_SIZE, leave rest in queue
			this.queue[0] = chunk.slice(this.CHUNK_SIZE);
			chunk = chunk.slice(0, this.CHUNK_SIZE);
		} else {
			// Take entire item
			this.queue.shift();
		}

		this.queuedBytes -= chunk.length;

		try {
			this.pty.write(chunk);
		} catch (error) {
			// PTY might be closed - clear queue and stop
			console.warn("[PtyWriteQueue] Write failed, clearing queue:", error);
			this.clear();
			this.flushing = false;
			return;
		}

		// Yield to event loop with a small delay, allowing other work to run
		setTimeout(() => this.flush(), this.CHUNK_DELAY_MS);
	}

	/**
	 * Number of bytes currently queued.
	 */
	get pending(): number {
		return this.queuedBytes;
	}

	/**
	 * Whether there's data waiting to be written.
	 */
	get hasPending(): boolean {
		return this.queuedBytes > 0;
	}

	/**
	 * Clear all pending writes.
	 */
	clear(): void {
		this.queue = [];
		this.queuedBytes = 0;
	}

	/**
	 * Stop processing and clear queue.
	 */
	dispose(): void {
		this.disposed = true;
		this.clear();
	}
}
