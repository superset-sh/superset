import { TerminalAttachCanceledError } from "../errors";

interface QueuedWaiter {
	priority: number;
	resolve: (release: () => void) => void;
	reject: (error: Error) => void;
	signal?: AbortSignal;
	onAbort?: () => void;
}

export class PrioritySemaphore {
	private inUse = 0;
	private queue: QueuedWaiter[] = [];

	constructor(private max: number) {}

	acquire(priority: number, signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted) {
			return Promise.reject(new TerminalAttachCanceledError());
		}

		if (this.inUse < this.max) {
			this.inUse++;
			return Promise.resolve(() => this.release());
		}

		return new Promise<() => void>((resolve, reject) => {
			const waiter: QueuedWaiter = { priority, resolve, reject, signal };
			if (signal) {
				waiter.onAbort = () => {
					const index = this.queue.indexOf(waiter);
					if (index === -1) return;
					this.queue.splice(index, 1);
					waiter.reject(new TerminalAttachCanceledError());
				};
				signal.addEventListener("abort", waiter.onAbort, { once: true });
			}
			this.queue.push(waiter);
			this.queue.sort((a, b) => a.priority - b.priority);
		});
	}

	private release(): void {
		this.inUse = Math.max(0, this.inUse - 1);
		this.pump();
	}

	private pump(): void {
		while (this.inUse < this.max && this.queue.length > 0) {
			const next = this.queue.shift();
			if (!next) return;
			if (next.onAbort && next.signal) {
				next.signal.removeEventListener("abort", next.onAbort);
			}
			if (next.signal?.aborted) {
				next.reject(new TerminalAttachCanceledError());
				continue;
			}
			this.inUse++;
			next.resolve(() => this.release());
		}
	}

	reset(): void {
		const waiters = this.queue;
		this.queue = [];
		this.inUse = 0;
		const error = new Error("Semaphore reset");
		for (const waiter of waiters) {
			if (waiter.onAbort && waiter.signal) {
				waiter.signal.removeEventListener("abort", waiter.onAbort);
			}
			waiter.reject(error);
		}
	}
}
