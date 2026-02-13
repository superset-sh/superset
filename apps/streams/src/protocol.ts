import { DurableStream, IdempotentProducer } from "@durable-streams/client";
import {
	createMessagesCollection,
	createModelMessagesCollection,
	createSessionDB,
	sessionStateSchema,
} from "@superset/durable-session";
import type {
	AIDBProtocolOptions,
	ProxySessionState,
	StreamChunk,
} from "./types";

type MessageRole = "user" | "assistant" | "system";

const FLUSH_TIMEOUT_MS = 10_000;

export class AIDBSessionProtocol {
	private readonly baseUrl: string;
	private streams = new Map<string, DurableStream>();
	private producers = new Map<string, IdempotentProducer>();
	private messageSeqs = new Map<string, number>();
	private sessionStates = new Map<string, ProxySessionState>();
	private producerErrors = new Map<string, Error[]>();
	private producerHealthy = new Map<string, boolean>();
	private activeGenerationIds = new Map<string, string>();
	private sessionLocks = new Map<string, Promise<void>>();

	constructor(options: AIDBProtocolOptions) {
		this.baseUrl = options.baseUrl;
	}

	private async withSessionLock<T>(
		sessionId: string,
		fn: () => Promise<T>,
	): Promise<T> {
		const prev = this.sessionLocks.get(sessionId) ?? Promise.resolve();
		let release: (() => void) | undefined;
		const current = new Promise<void>((r) => {
			release = r;
		});
		this.sessionLocks.set(sessionId, current);

		await prev;
		try {
			return await fn();
		} finally {
			if (this.sessionLocks.get(sessionId) === current) {
				this.sessionLocks.delete(sessionId);
			}
			if (release) {
				release();
			}
		}
	}

	private recordProducerError(sessionId: string, err: unknown): void {
		const errors = this.producerErrors.get(sessionId);
		if (errors) {
			errors.push(err instanceof Error ? err : new Error(String(err)));
		}
		this.producerHealthy.set(sessionId, false);
	}

	private drainProducerErrors(sessionId: string): Error[] {
		const errors = this.producerErrors.get(sessionId);
		if (!errors || errors.length === 0) return [];
		const drained = [...errors];
		errors.length = 0;
		return drained;
	}

	async createSession(sessionId: string): Promise<DurableStream> {
		const stream = new DurableStream({
			url: `${this.baseUrl}/v1/stream/sessions/${sessionId}`,
		});

		await stream.create({ contentType: "application/json" });
		this.streams.set(sessionId, stream);
		this.producerErrors.set(sessionId, []);
		this.producerHealthy.set(sessionId, true);

		const producer = new IdempotentProducer(stream, `session-${sessionId}`, {
			autoClaim: true,
			lingerMs: 1, // Desktop ChunkBatcher already coalesces at 5ms

			maxInFlight: 5,
			onError: (err) => {
				console.error(`[protocol] Producer error for ${sessionId}:`, err);
				this.recordProducerError(sessionId, err);
			},
		});
		this.producers.set(sessionId, producer);

		await this.initializeSessionState(sessionId);

		return stream;
	}

	async getOrCreateSession(sessionId: string): Promise<DurableStream> {
		let stream = this.streams.get(sessionId);
		if (!stream) {
			stream = await this.createSession(sessionId);
		}
		return stream;
	}

	getSession(sessionId: string): DurableStream | undefined {
		return this.streams.get(sessionId);
	}

	async deleteSession(sessionId: string): Promise<void> {
		return this.withSessionLock(sessionId, async () => {
			const producer = this.producers.get(sessionId);
			if (producer) {
				try {
					await producer.flush();
				} catch (err) {
					console.error(
						`[protocol] Failed to flush producer for ${sessionId}:`,
						err,
					);
				}
				try {
					await producer.detach();
				} catch (err) {
					console.error(
						`[protocol] Failed to detach producer for ${sessionId}:`,
						err,
					);
				}
				this.producers.delete(sessionId);
			}

			const state = this.sessionStates.get(sessionId);
			if (state) {
				state.changeSubscription?.unsubscribe();
				state.sessionDB.close();
			}

			this.streams.delete(sessionId);
			this.sessionStates.delete(sessionId);
			this.producerErrors.delete(sessionId);
			this.producerHealthy.delete(sessionId);
			this.activeGenerationIds.delete(sessionId);
		});
	}

	async resetSession(sessionId: string, _clearPresence = false): Promise<void> {
		return this.withSessionLock(sessionId, async () => {
			const stream = this.streams.get(sessionId);
			if (!stream) {
				throw new Error(`Session ${sessionId} not found`);
			}

			// Flush before reset so queued chunks are ordered before the control event
			await this.flushSession(sessionId);

			await stream.append(
				JSON.stringify({ headers: { control: "reset" as const } }),
			);

			const state = this.sessionStates.get(sessionId);
			const generationMessageIds = new Set<string>(
				state?.activeGenerations ?? [],
			);
			const activeMessageId = this.activeGenerationIds.get(sessionId);
			if (activeMessageId) {
				generationMessageIds.add(activeMessageId);
			}
			for (const generationMessageId of generationMessageIds) {
				this.messageSeqs.delete(generationMessageId);
			}

			this.producerErrors.set(sessionId, []);
			this.producerHealthy.set(sessionId, true);
			this.activeGenerationIds.delete(sessionId);
			if (state) {
				state.activeGenerations = [];
			}

			this.updateLastActivity(sessionId);
		});
	}

	private updateLastActivity(sessionId: string): void {
		const state = this.sessionStates.get(sessionId);
		if (state) {
			state.lastActivityAt = new Date().toISOString();
		}
	}

	private async initializeSessionState(sessionId: string): Promise<void> {
		const sessionDB = createSessionDB({
			sessionId,
			baseUrl: this.baseUrl,
		});

		await sessionDB.preload();

		const messages = createMessagesCollection({
			chunksCollection: sessionDB.collections.chunks,
		});

		const modelMessages = createModelMessagesCollection({
			messagesCollection: messages,
		});

		this.sessionStates.set(sessionId, {
			createdAt: new Date().toISOString(),
			lastActivityAt: new Date().toISOString(),
			activeGenerations: [],
			sessionDB,
			messages,
			modelMessages,
			changeSubscription: null,
			isReady: true,
		});
	}

	private getNextSeq(messageId: string): number {
		const current = this.messageSeqs.get(messageId) ?? -1;
		const next = current + 1;
		this.messageSeqs.set(messageId, next);
		return next;
	}

	private clearSeq(messageId: string): void {
		this.messageSeqs.delete(messageId);
	}

	async writeChunk(
		_stream: DurableStream,
		sessionId: string,
		messageId: string,
		actorId: string,
		role: MessageRole,
		chunk: StreamChunk,
		txid?: string,
	): Promise<void> {
		const seq = this.getNextSeq(messageId);

		const event = sessionStateSchema.chunks.insert({
			key: `${messageId}:${seq}`,
			value: {
				messageId,
				actorId,
				role,
				chunk: JSON.stringify(chunk),
				seq,
				createdAt: new Date().toISOString(),
			},
			...(txid && { headers: { txid } }),
		});

		await this.appendToStream(sessionId, JSON.stringify(event));
		this.updateLastActivity(sessionId);
	}

	async writeChunks({
		sessionId,
		chunks,
	}: {
		sessionId: string;
		chunks: Array<{
			messageId: string;
			actorId: string;
			role: MessageRole;
			chunk: StreamChunk;
			txid?: string;
		}>;
	}): Promise<void> {
		for (const c of chunks) {
			const seq = this.getNextSeq(c.messageId);
			const event = sessionStateSchema.chunks.insert({
				key: `${c.messageId}:${seq}`,
				value: {
					messageId: c.messageId,
					actorId: c.actorId,
					role: c.role,
					chunk: JSON.stringify(c.chunk),
					seq,
					createdAt: new Date().toISOString(),
				},
				...(c.txid && { headers: { txid: c.txid } }),
			});
			await this.appendToStream(sessionId, JSON.stringify(event));
		}
		this.updateLastActivity(sessionId);
	}

	private async appendToStream(
		sessionId: string,
		data: string,
		{ flush = false }: { flush?: boolean } = {},
	): Promise<void> {
		const producer = this.producers.get(sessionId);
		const healthy = this.producerHealthy.get(sessionId) !== false;

		if (producer && healthy) {
			producer.append(data);
			if (flush) {
				await producer.flush();
			}
			return;
		}

		const stream = this.streams.get(sessionId);
		if (!stream) {
			throw new Error(`Session ${sessionId} not found`);
		}
		await stream.append(data);
	}

	async flushSession(sessionId: string): Promise<void> {
		const producer = this.producers.get(sessionId);
		if (!producer) return;

		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() => reject(new Error(`Flush timed out for session ${sessionId}`)),
				FLUSH_TIMEOUT_MS,
			);
		});
		try {
			await Promise.race([producer.flush(), timeout]);
		} finally {
			clearTimeout(timer);
		}
		this.producerHealthy.set(sessionId, true);
	}

	startGeneration({
		sessionId,
		messageId,
	}: {
		sessionId: string;
		messageId: string;
	}): void {
		const existing = this.activeGenerationIds.get(sessionId);
		if (existing) {
			console.warn(
				`[protocol] Overwriting active generation ${existing} with ${messageId} for ${sessionId}`,
			);
		}
		this.activeGenerationIds.set(sessionId, messageId);
	}

	getActiveGeneration(sessionId: string): string | undefined {
		return this.activeGenerationIds.get(sessionId);
	}

	async finishGeneration({
		sessionId,
		messageId,
	}: {
		sessionId: string;
		messageId?: string;
	}): Promise<void> {
		await this.flushSession(sessionId);

		if (messageId) {
			this.clearSeq(messageId);
		}
		const activeMessageId = this.activeGenerationIds.get(sessionId);
		if (!activeMessageId) {
			// no-op
		} else if (!messageId || messageId === activeMessageId) {
			this.activeGenerationIds.delete(sessionId);
		} else {
			console.warn(
				`[protocol] Ignoring stale finish for ${sessionId}: got ${messageId}, active is ${activeMessageId}`,
			);
		}

		const errors = this.drainProducerErrors(sessionId);
		if (errors.length > 0) {
			throw new Error(
				`Producer encountered ${errors.length} background error(s) during generation: ${errors.map((e) => e.message).join("; ")}`,
			);
		}
	}

	async writeUserMessage(
		stream: DurableStream,
		sessionId: string,
		messageId: string,
		actorId: string,
		content: string,
		txid?: string,
	): Promise<void> {
		const message = {
			id: messageId,
			role: "user" as const,
			parts: [{ type: "text" as const, content }],
			createdAt: new Date().toISOString(),
		};

		const event = sessionStateSchema.chunks.insert({
			key: `${messageId}:0`,
			value: {
				messageId,
				actorId,
				role: "user" as const,
				chunk: JSON.stringify({
					type: "whole-message",
					message,
				}),
				seq: 0,
				createdAt: new Date().toISOString(),
			},
			...(txid && { headers: { txid } }),
		});

		// Flush producer for ordering, then write directly to stream
		// so the txid header is immediately visible to subscribers.
		await this.flushSession(sessionId);
		await stream.append(JSON.stringify(event));
		this.updateLastActivity(sessionId);
	}

	async writePresence(
		_stream: DurableStream,
		sessionId: string,
		actorId: string,
		deviceId: string,
		actorType: "user" | "agent",
		status: "online" | "offline" | "away",
		name?: string,
	): Promise<void> {
		const event = sessionStateSchema.presence.upsert({
			key: `${actorId}:${deviceId}`,
			value: {
				actorId,
				deviceId,
				actorType,
				name,
				status,
				lastSeenAt: new Date().toISOString(),
			},
		});

		await this.appendToStream(sessionId, JSON.stringify(event), {
			flush: true,
		});
		this.updateLastActivity(sessionId);
	}

	async getDeviceIdsForActor(
		sessionId: string,
		actorId: string,
	): Promise<string[]> {
		const state = this.sessionStates.get(sessionId);
		if (!state) {
			return [];
		}

		const presence = state.sessionDB.collections.presence;
		const deviceIds: string[] = [];

		for (const row of presence.values()) {
			if (row.actorId === actorId && row.status === "online") {
				deviceIds.push(row.deviceId);
			}
		}

		return deviceIds;
	}

	stopGeneration(_sessionId: string, _messageId: string | null): void {
		// No-op: agent execution moved to desktop. Cross-client stop
		// requires future signaling implementation. The /stop endpoint
		// still exists so clients don't get 404.
	}

	async writeToolResult(
		stream: DurableStream,
		sessionId: string,
		messageId: string,
		actorId: string,
		toolCallId: string,
		output: unknown,
		error: string | null,
		txid?: string,
	): Promise<void> {
		await this.writeChunk(
			stream,
			sessionId,
			messageId,
			actorId,
			"user",
			{
				type: "tool-result",
				toolCallId,
				output,
				error,
			} as StreamChunk,
			txid,
		);

		await this.flushSession(sessionId);
		this.clearSeq(messageId);
	}

	async writeApprovalResponse(
		stream: DurableStream,
		sessionId: string,
		actorId: string,
		approvalId: string,
		approved: boolean,
		txid?: string,
	): Promise<void> {
		const messageId = crypto.randomUUID();

		await this.writeChunk(
			stream,
			sessionId,
			messageId,
			actorId,
			"user",
			{
				type: "approval-response",
				approvalId,
				approved,
			} as StreamChunk,
			txid,
		);

		await this.flushSession(sessionId);
		this.clearSeq(messageId);
	}

	async forkSession(
		sessionId: string,
		_atMessageId: string | null,
		newSessionId: string | null,
	): Promise<{ sessionId: string; offset: string }> {
		const targetSessionId = newSessionId ?? crypto.randomUUID();

		const sourceStream = this.streams.get(sessionId);
		if (!sourceStream) {
			throw new Error(`Session ${sessionId} not found`);
		}

		await this.createSession(targetSessionId);

		const sourceState = this.sessionStates.get(sessionId);
		if (sourceState) {
			this.sessionStates.set(targetSessionId, {
				...sourceState,
				createdAt: new Date().toISOString(),
				lastActivityAt: new Date().toISOString(),
				activeGenerations: [],
			});
		}

		// TODO: Copy stream data up to atMessageId
		return {
			sessionId: targetSessionId,
			offset: "-1",
		};
	}

	async getMessageHistory(
		sessionId: string,
	): Promise<Array<{ role: string; content: string }>> {
		const state = this.sessionStates.get(sessionId);

		if (!state || !state.isReady) {
			console.warn(
				`[Protocol] Session ${sessionId} not ready for message history`,
			);
			return [];
		}

		return state.modelMessages.toArray.map((msg) => ({
			role: msg.role,
			content: msg.content,
		}));
	}
}
