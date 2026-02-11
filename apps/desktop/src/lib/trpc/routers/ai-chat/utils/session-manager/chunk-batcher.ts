export interface ChunkPayload {
	messageId: string;
	actorId: string;
	role: string;
	chunk: unknown;
}

export class ChunkBatcher {
	private buffer: ChunkPayload[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private sendChain = Promise.resolve();
	private dropped = 0;
	private consecutiveFailures = 0;

	private readonly sendBatch: (chunks: ChunkPayload[]) => Promise<void>;
	private readonly lingerMs: number;
	private readonly maxBatchSize: number;
	private readonly maxBufferSize: number;
	private readonly maxRetries: number;
	private readonly retryBaseMs: number;

	constructor({
		sendBatch,
		lingerMs = 5,
		maxBatchSize = 50,
		maxBufferSize = 2000,
		maxRetries = 3,
		retryBaseMs = 50,
	}: {
		sendBatch: (chunks: ChunkPayload[]) => Promise<void>;
		lingerMs?: number;
		maxBatchSize?: number;
		maxBufferSize?: number;
		maxRetries?: number;
		retryBaseMs?: number;
	}) {
		this.sendBatch = sendBatch;
		this.lingerMs = lingerMs;
		this.maxBatchSize = maxBatchSize;
		this.maxBufferSize = maxBufferSize;
		this.maxRetries = maxRetries;
		this.retryBaseMs = retryBaseMs;
	}

	private async sendWithRetry(batch: ChunkPayload[]): Promise<void> {
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				await this.sendBatch(batch);
				this.consecutiveFailures = 0;
				return;
			} catch (err) {
				if (err instanceof DOMException && err.name === "AbortError") {
					throw err;
				}

				this.consecutiveFailures++;

				if (attempt === this.maxRetries) {
					console.error(
						`[chunk-batcher] Batch failed after ${this.maxRetries + 1} attempts, dropping ${batch.length} chunk(s)`,
					);
					return;
				}

				const delayMs = this.retryBaseMs * 2 ** attempt;
				await new Promise((r) => setTimeout(r, delayMs));
			}
		}
	}

	push(payload: ChunkPayload): void {
		if (this.buffer.length >= this.maxBufferSize) {
			this.buffer.shift();
			this.dropped++;
			if (this.dropped === 1 || this.dropped % 100 === 0) {
				console.warn(
					`[chunk-batcher] Buffer full, dropped ${this.dropped} chunk(s)`,
				);
			}
		}

		this.buffer.push(payload);
		if (this.buffer.length >= this.maxBatchSize) {
			this.flush();
		} else if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flushTimer = null;
				this.flush();
			}, this.lingerMs);
		}
	}

	private flush(): void {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		if (this.buffer.length === 0) return;
		const batch = this.buffer;
		this.buffer = [];
		this.sendChain = this.sendChain.then(() => this.sendWithRetry(batch));
	}

	async drain(): Promise<void> {
		this.flush();
		await this.sendChain;
	}

	get droppedCount(): number {
		return this.dropped;
	}

	get isHealthy(): boolean {
		return this.consecutiveFailures < this.maxRetries;
	}
}
