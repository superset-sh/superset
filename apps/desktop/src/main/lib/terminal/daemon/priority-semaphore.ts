interface QueuedWaiter {
	priority: number;
	resolve: (release: () => void) => void;
	reject: (error: Error) => void;
}

export class PrioritySemaphore {
	private inUse = 0;
	private queue: QueuedWaiter[] = [];

	constructor(private max: number) {}

	acquire(priority: number): Promise<() => void> {
		if (this.inUse < this.max) {
			this.inUse++;
			return Promise.resolve(() => this.release());
		}

		return new Promise<() => void>((resolve, reject) => {
			this.queue.push({ priority, resolve, reject });
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
			waiter.reject(error);
		}
	}
}
