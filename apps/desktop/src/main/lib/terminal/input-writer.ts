import type * as pty from "node-pty";

/**
 * Non-blocking input writer for PTY.
 *
 * Prevents the main thread from blocking when writing large amounts of data
 * (e.g., pasting Unicode text) by:
 * 1. Chunking large writes into smaller pieces
 * 2. Using setImmediate between chunks to yield the event loop
 *
 * This fixes crashes caused by synchronous PTY writes blocking when the
 * PTY buffer fills up faster than the shell can consume data.
 */

/**
 * Maximum chunk size for PTY writes (4KB).
 * This is small enough to not block noticeably, but large enough
 * to be efficient for normal input.
 */
const CHUNK_SIZE = 4 * 1024;

/**
 * Threshold for using chunked writes.
 * Data smaller than this is written directly (no overhead).
 */
const CHUNK_THRESHOLD = CHUNK_SIZE;

export class InputWriter {
	private pty: pty.IPty;
	private writeQueue: string[] = [];
	private isWriting = false;
	private isDisposed = false;

	constructor(ptyProcess: pty.IPty) {
		this.pty = ptyProcess;
	}

	/**
	 * Write data to the PTY without blocking the main thread.
	 *
	 * Small writes are sent directly. Large writes are chunked and
	 * processed asynchronously to prevent blocking.
	 */
	write(data: string): void {
		if (this.isDisposed) {
			return;
		}

		// Small data: write directly (most common case - single keystrokes)
		if (data.length < CHUNK_THRESHOLD) {
			try {
				this.pty.write(data);
			} catch (error) {
				console.error("[InputWriter] Write failed:", error);
			}
			return;
		}

		// Large data: queue and process in chunks
		this.writeQueue.push(data);
		this.processQueue();
	}

	/**
	 * Process queued writes in chunks, yielding the event loop between chunks.
	 */
	private processQueue(): void {
		if (this.isWriting || this.writeQueue.length === 0 || this.isDisposed) {
			return;
		}

		this.isWriting = true;
		this.writeNextChunk();
	}

	private writeNextChunk(): void {
		if (this.isDisposed) {
			this.isWriting = false;
			this.writeQueue = [];
			return;
		}

		// Get next chunk from front of queue
		const data = this.writeQueue[0];
		if (!data) {
			this.isWriting = false;
			return;
		}

		// Write one chunk
		const chunk = data.slice(0, CHUNK_SIZE);
		const remaining = data.slice(CHUNK_SIZE);

		try {
			this.pty.write(chunk);
		} catch (error) {
			console.error("[InputWriter] Chunk write failed:", error);
			// Remove the problematic data and continue with next
			this.writeQueue.shift();
			if (this.writeQueue.length > 0) {
				setImmediate(() => this.writeNextChunk());
			} else {
				this.isWriting = false;
			}
			return;
		}

		// Update queue
		if (remaining.length > 0) {
			// More chunks to write from this data
			this.writeQueue[0] = remaining;
		} else {
			// This data is complete, remove from queue
			this.writeQueue.shift();
		}

		// Schedule next chunk (yields event loop)
		if (this.writeQueue.length > 0) {
			setImmediate(() => this.writeNextChunk());
		} else {
			this.isWriting = false;
		}
	}

	/**
	 * Dispose of the writer, canceling any pending writes.
	 */
	dispose(): void {
		this.isDisposed = true;
		this.writeQueue = [];
		this.isWriting = false;
	}
}
