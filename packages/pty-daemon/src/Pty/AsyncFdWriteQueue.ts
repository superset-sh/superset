import { write as fsWrite } from "node:fs";

const DEFAULT_MAX_QUEUED_BYTES = 8 * 1024 * 1024;
const DEFAULT_MIN_BACKOFF_MS = 2;
const DEFAULT_MAX_BACKOFF_MS = 50;

export type FdWriteCallback = (
	err: NodeJS.ErrnoException | null,
	bytesWritten: number,
	buffer: Buffer,
) => void;

export type FdWrite = (
	fd: number,
	buffer: Buffer,
	offset: number,
	length: number,
	position: null,
	callback: FdWriteCallback,
) => void;

export type FdClose = (fd: number) => void;

/** Fatal queue state with an exact accounting of accepted, undelivered input. */
export class AsyncFdWriteFailure extends Error {
	readonly undeliveredBytes: number;

	constructor(cause: Error, undeliveredBytes: number) {
		super(`${cause.message} (${undeliveredBytes} bytes undelivered)`);
		this.name = "AsyncFdWriteFailure";
		this.cause = cause;
		this.undeliveredBytes = undeliveredBytes;
	}
}

interface PendingWrite {
	buffer: Buffer;
	offset: number;
}

interface DrainWaiter {
	resolve: () => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
}

export interface AsyncFdWriteQueueOptions {
	fd: number;
	maxQueuedBytes?: number;
	minBackoffMs?: number;
	maxBackoffMs?: number;
	write?: FdWrite;
	/**
	 * When provided, the queue owns `fd` and closes it after disposal.
	 * An fd with a submitted fs.write is kept open until that write's callback:
	 * closing it earlier lets the OS reuse the number while libuv still holds it.
	 */
	closeFd?: FdClose;
	onFatalError?: (error: Error) => void;
}

/**
 * A single-flight FIFO for PTY master writes.
 *
 * fs.write runs on libuv's worker pool, so a blocking inherited fd cannot
 * stall the daemon event loop. Only one write is active per PTY, preserving
 * input order while partial writes and transient kernel backpressure retry.
 */
export class AsyncFdWriteQueue {
	private readonly fd: number;
	private readonly maxQueuedBytes: number;
	private readonly minBackoffMs: number;
	private readonly maxBackoffMs: number;
	private readonly writeFd: FdWrite;
	private readonly closeFd?: FdClose;
	private readonly onFatalError?: (error: Error) => void;
	private readonly queue: PendingWrite[] = [];
	private readonly drainWaiters: DrainWaiter[] = [];
	private queuedBytes = 0;
	private inFlight = false;
	private flushImmediate: NodeJS.Immediate | null = null;
	private retryTimer: NodeJS.Timeout | null = null;
	private backoffMs = 0;
	private frozen = false;
	private disposed = false;
	private failure: Error | null = null;
	private generation = 0;
	private fdClosed = false;

	constructor(options: AsyncFdWriteQueueOptions) {
		this.fd = options.fd;
		this.maxQueuedBytes = options.maxQueuedBytes ?? DEFAULT_MAX_QUEUED_BYTES;
		this.minBackoffMs = options.minBackoffMs ?? DEFAULT_MIN_BACKOFF_MS;
		this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
		this.writeFd = options.write ?? fsWrite;
		this.closeFd = options.closeFd;
		this.onFatalError = options.onFatalError;

		if (!Number.isInteger(this.maxQueuedBytes) || this.maxQueuedBytes <= 0) {
			throw new Error(`invalid max queued bytes: ${this.maxQueuedBytes}`);
		}
		if (!Number.isInteger(this.minBackoffMs) || this.minBackoffMs <= 0) {
			throw new Error(`invalid minimum write backoff: ${this.minBackoffMs}`);
		}
		if (
			!Number.isInteger(this.maxBackoffMs) ||
			this.maxBackoffMs < this.minBackoffMs
		) {
			throw new Error(`invalid maximum write backoff: ${this.maxBackoffMs}`);
		}
	}

	enqueue(data: Buffer): void {
		this.assertWritable();
		if (data.byteLength === 0) return;
		if (this.queuedBytes + data.byteLength > this.maxQueuedBytes) {
			throw new Error(
				`pty input backlog exceeded hard limit (${this.queuedBytes} queued + ${data.byteLength} new > ${this.maxQueuedBytes} bytes)`,
			);
		}

		const copy = Buffer.from(data);
		this.queue.push({ buffer: copy, offset: 0 });
		this.queuedBytes += copy.byteLength;
		this.scheduleFlush();
	}

	async freezeAndDrain(timeoutMs: number): Promise<void> {
		this.assertOperational();
		if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
			throw new Error(`invalid write drain timeout: ${timeoutMs}`);
		}
		this.frozen = true;
		if (this.isDrained()) return;

		await new Promise<void>((resolve, reject) => {
			const waiter: DrainWaiter = {
				resolve,
				reject,
				timer: setTimeout(() => {
					const index = this.drainWaiters.indexOf(waiter);
					if (index >= 0) this.drainWaiters.splice(index, 1);
					reject(
						new Error(
							`pty input queue did not drain within ${timeoutMs}ms (${this.queuedBytes} bytes pending)`,
						),
					);
				}, timeoutMs),
			};
			waiter.timer.unref();
			this.drainWaiters.push(waiter);
		});
	}

	unfreeze(): void {
		if (this.disposed) return;
		this.frozen = false;
	}

	dispose(reason = new Error("pty write queue disposed")): void {
		if (this.disposed) return;
		this.disposed = true;
		this.generation += 1;
		this.clearScheduledWork();
		this.queue.length = 0;
		this.queuedBytes = 0;
		this.rejectDrainWaiters(reason);
		this.closeOwnedFdIfIdle();
	}

	get pendingBytes(): number {
		return this.queuedBytes;
	}

	private assertOperational(): void {
		if (this.failure) throw this.failure;
		if (this.disposed) throw new Error("pty write queue disposed");
	}

	private assertWritable(): void {
		this.assertOperational();
		if (this.frozen) throw new Error("pty input is frozen for daemon handoff");
	}

	private scheduleFlush(): void {
		if (
			this.disposed ||
			this.failure ||
			this.inFlight ||
			this.flushImmediate ||
			this.retryTimer ||
			this.queue.length === 0
		) {
			return;
		}

		this.flushImmediate = setImmediate(() => {
			this.flushImmediate = null;
			this.flushOne();
		});
	}

	private flushOne(): void {
		if (this.disposed || this.failure || this.inFlight) return;
		const pending = this.queue[0];
		if (!pending) {
			this.resolveDrainWaitersIfDrained();
			return;
		}

		const length = pending.buffer.byteLength - pending.offset;
		const generation = this.generation;
		this.inFlight = true;
		try {
			this.writeFd(
				this.fd,
				pending.buffer,
				pending.offset,
				length,
				null,
				(err, bytesWritten) => {
					this.inFlight = false;
					if (generation !== this.generation || this.disposed) {
						this.closeOwnedFdIfIdle();
						return;
					}

					if (err) {
						if (isRetryableWriteError(err)) {
							this.scheduleRetry();
							return;
						}
						this.fail(err);
						return;
					}

					if (bytesWritten === 0) {
						this.scheduleRetry();
						return;
					}
					if (!Number.isInteger(bytesWritten) || bytesWritten < 0) {
						this.fail(new Error(`pty write returned ${bytesWritten} bytes`));
						return;
					}
					if (bytesWritten > length) {
						this.fail(
							new Error(
								`pty write returned ${bytesWritten} bytes for a ${length}-byte buffer`,
							),
						);
						return;
					}

					this.backoffMs = 0;
					pending.offset += bytesWritten;
					this.queuedBytes -= bytesWritten;
					if (pending.offset === pending.buffer.byteLength) this.queue.shift();
					this.scheduleFlush();
					this.resolveDrainWaitersIfDrained();
				},
			);
		} catch (err) {
			this.inFlight = false;
			this.fail(asError(err));
		}
	}

	private scheduleRetry(): void {
		if (this.disposed || this.failure || this.retryTimer) return;
		this.backoffMs =
			this.backoffMs === 0
				? this.minBackoffMs
				: Math.min(this.backoffMs * 2, this.maxBackoffMs);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.scheduleFlush();
		}, this.backoffMs);
		this.retryTimer.unref();
	}

	private fail(error: Error): void {
		if (this.failure || this.disposed) return;
		const failure = new AsyncFdWriteFailure(error, this.queuedBytes);
		this.failure = failure;
		this.generation += 1;
		this.clearScheduledWork();
		// Keep every accepted, undelivered buffer and its byte count observable in
		// the failed state. Only explicit disposal may discard that evidence.
		// Every call site reaches fail() only after the submitted write callback (or
		// synchronous throw) has cleared inFlight, preserving fd lifetime safety.
		this.rejectDrainWaiters(failure);
		this.onFatalError?.(failure);
	}

	private isDrained(): boolean {
		return (
			this.queue.length === 0 &&
			!this.inFlight &&
			!this.flushImmediate &&
			!this.retryTimer
		);
	}

	private resolveDrainWaitersIfDrained(): void {
		if (!this.isDrained()) return;
		for (const waiter of this.drainWaiters.splice(0)) {
			clearTimeout(waiter.timer);
			waiter.resolve();
		}
	}

	private rejectDrainWaiters(error: Error): void {
		for (const waiter of this.drainWaiters.splice(0)) {
			clearTimeout(waiter.timer);
			waiter.reject(error);
		}
	}

	private clearScheduledWork(): void {
		if (this.flushImmediate) clearImmediate(this.flushImmediate);
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.flushImmediate = null;
		this.retryTimer = null;
	}

	private closeOwnedFdIfIdle(): void {
		if (!this.closeFd || this.fdClosed || this.inFlight) return;
		this.fdClosed = true;
		try {
			this.closeFd(this.fd);
		} catch (error) {
			// Closing is cleanup and must never turn a late libuv callback into an
			// uncaught exception. Surface it through the existing fatal channel.
			this.onFatalError?.(asError(error));
		}
	}
}

function isRetryableWriteError(error: NodeJS.ErrnoException): boolean {
	return (
		error.code === "EAGAIN" ||
		error.code === "EWOULDBLOCK" ||
		error.code === "EINTR"
	);
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
