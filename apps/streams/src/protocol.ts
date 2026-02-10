import { DurableStream } from "@durable-streams/client";
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

export class AIDBSessionProtocol {
	private readonly baseUrl: string;
	private streams = new Map<string, DurableStream>();
	private messageSeqs = new Map<string, number>();
	private sessionStates = new Map<string, ProxySessionState>();

	constructor(options: AIDBProtocolOptions) {
		this.baseUrl = options.baseUrl;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Session Management
	// ═══════════════════════════════════════════════════════════════════════

	async createSession(sessionId: string): Promise<DurableStream> {
		const stream = new DurableStream({
			url: `${this.baseUrl}/v1/stream/sessions/${sessionId}`,
		});

		await stream.create({ contentType: "application/json" });
		this.streams.set(sessionId, stream);
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

	deleteSession(sessionId: string): void {
		const state = this.sessionStates.get(sessionId);
		if (state) {
			state.changeSubscription?.unsubscribe();
			state.sessionDB.close();
		}

		this.streams.delete(sessionId);
		this.sessionStates.delete(sessionId);
	}

	async resetSession(sessionId: string, _clearPresence = false): Promise<void> {
		const stream = this.streams.get(sessionId);
		if (!stream) {
			throw new Error(`Session ${sessionId} not found`);
		}

		await stream.append(
			JSON.stringify({ headers: { control: "reset" as const } }),
		);

		this.messageSeqs.clear();
		const state = this.sessionStates.get(sessionId);
		if (state) {
			state.activeGenerations = [];
		}

		this.updateLastActivity(sessionId);
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

	// ═══════════════════════════════════════════════════════════════════════
	// Chunk Writing (STATE-PROTOCOL)
	// ═══════════════════════════════════════════════════════════════════════

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
		stream: DurableStream,
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

		const result = await stream.append(JSON.stringify(event));
		this.updateLastActivity(sessionId);

		return result;
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

		const result = await stream.append(JSON.stringify(event));
		this.updateLastActivity(sessionId);

		return result;
	}

	async writePresence(
		stream: DurableStream,
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

		await stream.append(JSON.stringify(event));
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

	// ═══════════════════════════════════════════════════════════════════════
	// Tool Results & Approvals
	// ═══════════════════════════════════════════════════════════════════════

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
		const result = await this.writeChunk(
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

		this.clearSeq(messageId);
		return result;
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

		const result = await this.writeChunk(
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

		this.clearSeq(messageId);
		return result;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Session Forking
	// ═══════════════════════════════════════════════════════════════════════

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

	// ═══════════════════════════════════════════════════════════════════════
	// Message History
	// ═══════════════════════════════════════════════════════════════════════

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
