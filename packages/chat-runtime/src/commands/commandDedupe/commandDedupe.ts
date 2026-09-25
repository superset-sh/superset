export const DEFAULT_DEDUPE_CAPACITY = 500;

export class CommandDedupe {
	private readonly results = new Map<string, unknown>();

	constructor(private readonly capacity: number = DEFAULT_DEDUPE_CAPACITY) {}

	run<T>(commandId: string, execute: () => T): T {
		if (this.results.has(commandId)) {
			const cached = this.results.get(commandId) as T;
			this.touch(commandId);
			return cached;
		}
		const result = execute();
		this.results.set(commandId, result);
		this.evict();
		return result;
	}

	has(commandId: string): boolean {
		return this.results.has(commandId);
	}

	get size(): number {
		return this.results.size;
	}

	private touch(commandId: string): void {
		const cached = this.results.get(commandId);
		this.results.delete(commandId);
		this.results.set(commandId, cached);
	}

	private evict(): void {
		while (this.results.size > this.capacity) {
			const oldest = this.results.keys().next();
			if (oldest.done) return;
			this.results.delete(oldest.value);
		}
	}
}
