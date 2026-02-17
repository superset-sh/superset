import type {
	ChatTransport,
	UIMessage,
	UIMessageChunk,
	ChatRequestOptions,
} from "ai";
import type { SessionDB } from "../collection";
import type { ChunkRow } from "../schema";

export interface DurableChatTransportOptions {
	proxyUrl: string;
	sessionId: string;
	sessionDB: SessionDB;
	headers?: Record<string, string>;
	onSend?: (content: string) => void | Promise<void>;
}

export class DurableChatTransport implements ChatTransport<UIMessage> {
	private readonly proxyUrl: string;
	private readonly sessionId: string;
	private readonly sessionDB: SessionDB;
	private readonly headers: Record<string, string>;
	private readonly onSend?: (content: string) => void | Promise<void>;

	constructor(options: DurableChatTransportOptions) {
		this.proxyUrl = options.proxyUrl;
		this.sessionId = options.sessionId;
		this.sessionDB = options.sessionDB;
		this.headers = options.headers ?? {};
		this.onSend = options.onSend;
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
		const { messages, abortSignal } = options;
		const lastMessage = messages[messages.length - 1];

		if (lastMessage?.role === "user") {
			const textPart = lastMessage.parts.find((p) => p.type === "text");
			const content = textPart
				? (textPart as { type: "text"; text: string }).text
				: "";

			await fetch(this.url("/messages"), {
				method: "POST",
				headers: { "Content-Type": "application/json", ...this.headers },
				body: JSON.stringify({ content, messageId: lastMessage.id }),
				signal: abortSignal,
				credentials: "include",
			});

			if (this.onSend) {
				Promise.resolve(this.onSend(content)).catch((err) =>
					console.error("[DurableChatTransport] onSend failed:", err),
				);
			}
		}

		// TODO: handle tool output and approval cases

		return this.createChunkStream(abortSignal);
	};

	reconnectToStream = async (
		_options: { chatId: string } & ChatRequestOptions,
	): Promise<ReadableStream<UIMessageChunk> | null> => {
		return this.createChunkStream(undefined);
	};

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

								if (parsed.type === "whole-message") {
									// User messages stored as whole — convert to UIMessageChunk sequence
									const msg = parsed.message;
									for (const part of msg.parts ?? []) {
										if (part.type === "text") {
											const id = crypto.randomUUID();
											controller.enqueue({
												type: "text-start",
												id,
											} as UIMessageChunk);
											controller.enqueue({
												type: "text-delta",
												id,
												delta: part.text ?? part.content,
											} as UIMessageChunk);
											controller.enqueue({
												type: "text-end",
												id,
											} as UIMessageChunk);
										}
									}
								} else {
									controller.enqueue(parsed as UIMessageChunk);
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
				});
			},
		});
	}
}
