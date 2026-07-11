/**
 * Single-consumer push queue used as the Claude SDK's streaming input.
 * Closing resolves pending and future reads; pushing after close is a bug.
 */
export class AsyncInputQueue<T> implements AsyncIterable<T> {
	private readonly buffered: T[] = [];
	private readonly readers: Array<
		(result: IteratorResult<T, undefined>) => void
	> = [];
	private closed = false;

	push(value: T): void {
		if (this.closed) {
			throw new Error("cannot push to a closed input queue");
		}
		const reader = this.readers.shift();
		if (reader) {
			reader({ done: false, value });
			return;
		}
		this.buffered.push(value);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		for (const reader of this.readers.splice(0)) {
			reader({ done: true, value: undefined });
		}
	}

	[Symbol.asyncIterator](): AsyncIterator<T, undefined> {
		return {
			next: () => {
				const value = this.buffered.shift();
				if (value !== undefined) {
					return Promise.resolve({ done: false as const, value });
				}
				if (this.closed) {
					return Promise.resolve({ done: true as const, value: undefined });
				}
				return new Promise<IteratorResult<T, undefined>>((resolve) => {
					this.readers.push(resolve);
				});
			},
			return: () => {
				this.close();
				return Promise.resolve({ done: true as const, value: undefined });
			},
		};
	}
}
