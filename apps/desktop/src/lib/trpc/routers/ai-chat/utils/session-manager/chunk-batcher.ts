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
 */
export class ChunkBatcher {
	private buffer: ChunkPayload[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private sendChain = Promise.resolve();

	private readonly sendBatch: (chunks: ChunkPayload[]) => Promise<void>;
	private readonly lingerMs: number;
	private readonly maxBatchSize: number;

	constructor({
		sendBatch,
		lingerMs = 5,
		maxBatchSize = 50,
	}: {
		sendBatch: (chunks: ChunkPayload[]) => Promise<void>;
		lingerMs?: number;
		maxBatchSize?: number;
	}) {
		this.sendBatch = sendBatch;
		this.lingerMs = lingerMs;
		this.maxBatchSize = maxBatchSize;
	}

	push(payload: ChunkPayload): void {
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
}
