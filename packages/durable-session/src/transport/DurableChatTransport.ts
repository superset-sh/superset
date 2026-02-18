import type {
	ChatRequestOptions,
	ChatTransport,
	UIMessage,
	UIMessageChunk,
} from "ai";
import type { SessionDB } from "../collection";
import type { ChunkRow } from "../schema";

/** Chunk types that are NOT AI SDK UIMessageChunks — skip these in the stream. */
const NON_CONTENT_TYPES = new Set([
	"whole-message",
	"config",
	"control",
	"tool-result",
	"approval-response",
	"tool-approval",
]);

export interface DurableChatTransportOptions {
	proxyUrl: string;
	sessionId: string;
	sessionDB: SessionDB;
	getHeaders?: () => Record<string, string>;
}

export class DurableChatTransport implements ChatTransport<UIMessage> {
	private readonly proxyUrl: string;
	private readonly sessionId: string;
	private readonly sessionDB: SessionDB;
	private readonly getHeaders: () => Record<string, string>;

	constructor(options: DurableChatTransportOptions) {
		this.proxyUrl = options.proxyUrl;
		this.sessionId = options.sessionId;
		this.sessionDB = options.sessionDB;
		this.getHeaders = options.getHeaders ?? (() => ({}));
	}

	private url(path: string): string {
		return `${this.proxyUrl}/api/streams/v1/sessions/${this.sessionId}${path}`;
	}

	sendMessages = async (
		options: {
			trigger: "submit-message" | "regenerate-message";
			chatId: string;
			messageId: string | undefined;
			messages: UIMessage[];
			abortSignal: AbortSignal | undefined;
		} & ChatRequestOptions,
	): Promise<ReadableStream<UIMessageChunk>> => {
		const { trigger, messages, abortSignal } = options;

		if (trigger === "submit-message") {
			const lastMessage = messages[messages.length - 1];
			if (lastMessage?.role === "user") {
				const textPart = lastMessage.parts.find((p) => p.type === "text");
				const content = textPart
					? (textPart as { type: "text"; text: string }).text
					: "";

				await fetch(this.url("/messages"), {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...this.getHeaders(),
					},
					body: JSON.stringify({ content, messageId: lastMessage.id }),
					signal: abortSignal,
				});
			}
		} else if (trigger === "regenerate-message") {
			await fetch(this.url("/control"), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...this.getHeaders(),
				},
				body: JSON.stringify({ action: "regenerate" }),
				signal: abortSignal,
			});
		}

		return this.createChunkStream(abortSignal);
	};

	reconnectToStream = async (
		_options: { chatId: string } & ChatRequestOptions,
	): Promise<ReadableStream<UIMessageChunk> | null> => {
		const chunks = this.sessionDB.collections.chunks;

		// Find assistant messageIds that have NOT finished
		const finished = new Set<string>();
		const assistantMessageIds = new Set<string>();
		for (const row of chunks.values()) {
			const r = row as ChunkRow;
			if (r.role !== "assistant") continue;
			assistantMessageIds.add(r.messageId);
			try {
				const parsed = JSON.parse(r.chunk);
				if (parsed.type === "finish" || parsed.type === "abort")
					finished.add(r.messageId);
			} catch {}
		}

		const incompleteId = [...assistantMessageIds].find(
			(id) => !finished.has(id),
		);
		if (!incompleteId) return null; // nothing streaming

		// Snapshot existing chunks for the incomplete message, then subscribe.
		// The race window between snapshot and subscribe is microseconds —
		// acceptable since the host writes orders of magnitude slower.
		const existingRows: ChunkRow[] = [];
		const seenKeys = new Set<string>();
		for (const row of chunks.values()) {
			const r = row as ChunkRow;
			if (r.messageId !== incompleteId) continue;
			existingRows.push(r);
			seenKeys.add(r.id);
		}
		existingRows.sort((a, b) => a.seq - b.seq);

		return new ReadableStream<UIMessageChunk>({
			start: (controller) => {
				// Replay existing chunks
				for (const row of existingRows) {
					try {
						const parsed = JSON.parse(row.chunk);
						const type = parsed.type as string;
						if (NON_CONTENT_TYPES.has(type)) continue;

						controller.enqueue(parsed as UIMessageChunk);

						if (type === "finish" || type === "abort") {
							controller.close();
							return;
						}
					} catch {}
				}

				// Forward new chunks as they arrive
				const subscription = chunks.subscribeChanges((changes) => {
					for (const change of changes) {
						if (change.type !== "insert" && change.type !== "update") continue;
						const row = change.value as ChunkRow;

						if (row.messageId !== incompleteId) continue;
						if (seenKeys.has(row.id)) continue;
						seenKeys.add(row.id);

						try {
							const parsed = JSON.parse(row.chunk);
							const type = parsed.type as string;
							if (NON_CONTENT_TYPES.has(type)) continue;

							controller.enqueue(parsed as UIMessageChunk);

							if (type === "finish" || type === "abort") {
								subscription.unsubscribe();
								controller.close();
							}
						} catch {}
					}
				});
			},
		});
	};

	async submitToolResult(
		toolCallId: string,
		output: unknown,
		error?: string,
	): Promise<void> {
		await fetch(this.url("/tool-results"), {
			method: "POST",
			headers: { "Content-Type": "application/json", ...this.getHeaders() },
			body: JSON.stringify({ toolCallId, output, error: error ?? null }),
		});
	}

	async submitApproval(
		approvalId: string,
		approved: boolean,
	): Promise<void> {
		await fetch(this.url(`/approvals/${approvalId}`), {
			method: "POST",
			headers: { "Content-Type": "application/json", ...this.getHeaders() },
			body: JSON.stringify({ approved }),
		});
	}

	/**
	 * Send a control event to the durable stream (e.g. abort the agent).
	 * Called automatically when the user stops a streaming response.
	 */
	private sendControl(action: string): void {
		fetch(this.url("/control"), {
			method: "POST",
			headers: { "Content-Type": "application/json", ...this.getHeaders() },
			body: JSON.stringify({ action }),
		}).catch(console.error);
	}

	private createChunkStream(
		abortSignal: AbortSignal | undefined,
	): ReadableStream<UIMessageChunk> {
		const chunks = this.sessionDB.collections.chunks;
		const seenKeys = new Set<string>();

		for (const row of chunks.values()) {
			seenKeys.add((row as ChunkRow).id);
		}

		return new ReadableStream<UIMessageChunk>({
			start: (controller) => {
				const subscription = chunks.subscribeChanges((changes) => {
					for (const change of changes) {
						if (change.type === "insert" || change.type === "update") {
							const row = change.value as ChunkRow;
							if (seenKeys.has(row.id)) continue;
							seenKeys.add(row.id);

							try {
								const parsed = JSON.parse(row.chunk);
								const type = parsed.type as string;

								// Skip non-AI-SDK chunk types
								if (NON_CONTENT_TYPES.has(type)) continue;

								controller.enqueue(parsed as UIMessageChunk);

								// Close after finish/abort — useChat reads until done:true
								if (type === "finish" || type === "abort") {
									subscription.unsubscribe();
									controller.close();
								}
							} catch {
								// skip unparseable chunks
							}
						}
					}
				});

				abortSignal?.addEventListener("abort", () => {
					subscription.unsubscribe();
					controller.close();
					// Tell the agent to stop generating
					this.sendControl("abort");
				});
			},
		});
	}
}
