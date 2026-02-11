export interface ChunkPayload {
	messageId: string;
	actorId: string;
	role: string;
	chunk: unknown;
}

/**
 * Buffers streaming chunks and flushes them in batches to reduce
 * per-chunk HTTP overhead. Chunks are coalesced within a short time
 * window (lingerMs) or when the batch reaches maxBatchSize.
 *
 * Ordering is preserved: batches are sent sequentially via a
 * promise chain so earlier chunks always arrive before later ones.
 *
 * maxBufferSize caps the number of unsent chunks in memory to
 * prevent OOM when the network or proxy is slower than the agent.
 * Once the cap is reached, oldest chunks are dropped.
 */
export class ChunkBatcher {
	private buffer: ChunkPayload[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private sendChain = Promise.resolve();
	private dropped = 0;

	private readonly sendBatch: (chunks: ChunkPayload[]) => Promise<void>;
	private readonly lingerMs: number;
	private readonly maxBatchSize: number;
	private readonly maxBufferSize: number;

	constructor({
		sendBatch,
		lingerMs = 5,
		maxBatchSize = 50,
		maxBufferSize = 2000,
	}: {
		sendBatch: (chunks: ChunkPayload[]) => Promise<void>;
		lingerMs?: number;
		maxBatchSize?: number;
		maxBufferSize?: number;
	}) {
		this.sendBatch = sendBatch;
		this.lingerMs = lingerMs;
		this.maxBatchSize = maxBatchSize;
		this.maxBufferSize = maxBufferSize;
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
		this.sendChain = this.sendChain.then(() => this.sendBatch(batch));
	}

	async drain(): Promise<void> {
		this.flush();
		await this.sendChain;
	}

	get droppedCount(): number {
		return this.dropped;
	}
}
