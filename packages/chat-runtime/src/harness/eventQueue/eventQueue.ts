import type { AdapterEvent } from "../types";

export class EventQueue {
	private readonly buffered: AdapterEvent[] = [];
	private waiting: ((result: IteratorResult<AdapterEvent>) => void) | null =
		null;
	private closed = false;

	push(event: AdapterEvent): void {
		if (this.closed) return;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: event, done: false });
			return;
		}
		this.buffered.push(event);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		const waiting = this.waiting;
		if (waiting) {
			this.waiting = null;
			waiting({ value: undefined, done: true });
		}
	}

	next(): Promise<IteratorResult<AdapterEvent>> {
		const buffered = this.buffered.shift();
		if (buffered) return Promise.resolve({ value: buffered, done: false });
		if (this.closed) return Promise.resolve({ value: undefined, done: true });
		return new Promise((resolve) => {
			this.waiting = resolve;
		});
	}

	iterable(): AsyncIterable<AdapterEvent> {
		return {
			[Symbol.asyncIterator]: (): AsyncIterator<AdapterEvent> => ({
				next: () => this.next(),
			}),
		};
	}
}
