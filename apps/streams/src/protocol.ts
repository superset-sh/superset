/**
 * AIDBSessionProtocol - STATE-PROTOCOL implementation for AI DB.
 *
 * Uses @durable-streams/client to write STATE-PROTOCOL events to Durable Streams.
 * Provides:
 * - Session management
 * - LLM API proxying with stream teeing
 * - Agent webhook invocation
 * - Chunk framing with sequence numbers
 */

import { DurableStream } from "@durable-streams/client";
import {
	createMessagesCollection,
	createModelMessagesCollection,
	createSessionDB,
	sessionStateSchema,
} from "@superset/durable-session";
import type {
	AgentSpec,
	AIDBProtocolOptions,
	ProxySessionState,
	StreamChunk,
} from "./types";

// Map role to the role type expected by the schema
type MessageRole = "user" | "assistant" | "system";

export class AIDBSessionProtocol {
	private readonly baseUrl: string;

	/** Active streams by sessionId */
	private streams = new Map<string, DurableStream>();

	/** Sequence counters per message for deduplication */
	private messageSeqs = new Map<string, number>();

	/** Active generation abort controllers */
	private activeAbortControllers = new Map<string, AbortController>();

	/** Session state with SessionDB and collections for message materialization */
	private sessionStates = new Map<string, ProxySessionState>();

	constructor(options: AIDBProtocolOptions) {
		this.baseUrl = options.baseUrl;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Session Management
	// ═══════════════════════════════════════════════════════════════════════

	async createSession(
		sessionId: string,
		defaultAgents?: AgentSpec[],
	): Promise<DurableStream> {
		const stream = new DurableStream({
			url: `${this.baseUrl}/v1/stream/sessions/${sessionId}`,
		});

		// Create the stream on the Durable Streams server
		await stream.create({ contentType: "application/json" });

		this.streams.set(sessionId, stream);

		// Initialize session state with SessionDB and collections
		await this.initializeSessionState(sessionId);

		// Register default agents if provided
		if (defaultAgents && defaultAgents.length > 0) {
			for (const agent of defaultAgents) {
				await this.writeAgentRegistration(stream, sessionId, agent);
				const state = this.sessionStates.get(sessionId);
				if (state) {
					state.agents.push(agent);
				}
			}
		}

		return stream;
	}

	async getOrCreateSession(
		sessionId: string,
		defaultAgents?: AgentSpec[],
	): Promise<DurableStream> {
		let stream = this.streams.get(sessionId);
		if (!stream) {
			stream = await this.createSession(sessionId, defaultAgents);
		}
		return stream;
	}

	getSession(sessionId: string): DurableStream | undefined {
		return this.streams.get(sessionId);
	}

	deleteSession(sessionId: string): void {
		const state = this.sessionStates.get(sessionId);
		if (state) {
			// Unsubscribe from changes
			state.changeSubscription?.unsubscribe();
			// Close SessionDB to cleanup stream subscription
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

		// Write control reset event to the stream
		const resetEvent = {
			headers: {
				control: "reset" as const,
			},
		};

		await stream.append(JSON.stringify(resetEvent));

		// Clear in-memory state
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
		// Create SessionDB (same as client does)
		const sessionDB = createSessionDB({
			sessionId,
			baseUrl: this.baseUrl,
		});

		// Preload to sync initial data from stream
		await sessionDB.preload();

		// Create the messages collection from chunks
		const messages = createMessagesCollection({
			chunksCollection: sessionDB.collections.chunks,
		});

		// Create the model messages collection (LLM-ready)
		const modelMessages = createModelMessagesCollection({
			messagesCollection: messages,
		});

		// Store in session state
		const state: ProxySessionState = {
			createdAt: new Date().toISOString(),
			lastActivityAt: new Date().toISOString(),
			agents: [],
			activeGenerations: [],
			sessionDB,
			messages,
			modelMessages,
			changeSubscription: null,
			isReady: true,
		};

		this.sessionStates.set(sessionId, state);

		// Set up reactive agent triggering AFTER preload completes
		this.setupReactiveAgentTrigger(sessionId);
	}

	private setupReactiveAgentTrigger(sessionId: string): void {
		const state = this.sessionStates.get(sessionId);
		if (!state) return;

		const stream = this.streams.get(sessionId);
		if (!stream) return;

		// Subscribe to changes in the modelMessages collection
		// subscribeChanges() only fires for NEW changes (after subscription)
		const subscription = state.modelMessages.subscribeChanges((changes) => {
			for (const change of changes) {
				if (change.type !== "insert") continue;

				const message = change.value;
				if (!message) continue;

				if (message.role !== "user") continue;

				this.getMessageHistory(sessionId)
					.then((history) => {
						this.notifyRegisteredAgents(
							stream,
							sessionId,
							"user-messages",
							history,
						);
					})
					.catch((err) => {
						console.error(
							`[Protocol] Failed to get message history for agent trigger:`,
							err,
						);
					});
			}
		});

		state.changeSubscription = subscription;
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

	async writeAgentRegistration(
		stream: DurableStream,
		sessionId: string,
		agent: AgentSpec,
	): Promise<void> {
		const event = sessionStateSchema.agents.upsert({
			key: agent.id,
			value: {
				agentId: agent.id,
				name: agent.name,
				endpoint: agent.endpoint,
				triggers: agent.triggers,
			},
		});

		const result = await stream.append(JSON.stringify(event));
		this.updateLastActivity(sessionId);

		return result;
	}

	async removeAgentRegistration(
		stream: DurableStream,
		sessionId: string,
		agentId: string,
	): Promise<void> {
		const event = sessionStateSchema.agents.delete({
			key: agentId,
		});

		const result = await stream.append(JSON.stringify(event));
		this.updateLastActivity(sessionId);

		return result;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Agent Invocation
	// ═══════════════════════════════════════════════════════════════════════

	async invokeAgent(
		stream: DurableStream,
		sessionId: string,
		agent: AgentSpec,
		messageHistory: Array<{ role: string; content: string }>,
	): Promise<void> {
		const messageId = crypto.randomUUID();
		const abortController = new AbortController();

		this.activeAbortControllers.set(messageId, abortController);
		this.addActiveGeneration(sessionId, messageId);

		try {
			const requestBody = {
				...agent.bodyTemplate,
				messages: messageHistory,
				stream: true,
			};

			const response = await fetch(agent.endpoint, {
				method: agent.method ?? "POST",
				headers: {
					"Content-Type": "application/json",
					...agent.headers,
				},
				body: JSON.stringify(requestBody),
				signal: abortController.signal,
			});

			if (!response.ok) {
				throw new Error(
					`Agent request failed: ${response.status} ${response.statusText}`,
				);
			}

			if (response.body) {
				await this.streamAgentResponse(
					stream,
					sessionId,
					messageId,
					agent.id,
					response.body,
					abortController.signal,
				);
			}
		} catch (error) {
			if ((error as Error).name === "AbortError") {
				await this.writeChunk(
					stream,
					sessionId,
					messageId,
					agent.id,
					"assistant",
					{
						type: "stop",
						reason: "aborted",
					} as StreamChunk,
				);
			} else {
				await this.writeChunk(
					stream,
					sessionId,
					messageId,
					agent.id,
					"assistant",
					{
						type: "error",
						error: (error as Error).message,
					} as StreamChunk,
				);
			}
			throw error;
		} finally {
			this.clearSeq(messageId);
			this.activeAbortControllers.delete(messageId);
			this.removeActiveGeneration(sessionId, messageId);
		}
	}

	private async streamAgentResponse(
		stream: DurableStream,
		sessionId: string,
		messageId: string,
		agentId: string,
		responseBody: ReadableStream<Uint8Array>,
		signal: AbortSignal,
	): Promise<void> {
		const reader = responseBody.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				if (signal.aborted) break;

				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith(":")) continue;

					if (trimmed.startsWith("data: ")) {
						const data = trimmed.slice(6);
						if (data === "[DONE]") continue;

						try {
							const chunk = JSON.parse(data) as StreamChunk;
							await this.writeChunk(
								stream,
								sessionId,
								messageId,
								agentId,
								"assistant",
								chunk,
							);
						} catch (err) {
							console.error(
								"[streams/protocol] Malformed SSE chunk:",
								data,
								err,
							);
						}
					}
				}
			}

			// Process remaining buffer
			if (buffer.trim()) {
				const data = buffer.startsWith("data: ") ? buffer.slice(6) : buffer;
				if (data !== "[DONE]") {
					try {
						const chunk = JSON.parse(data) as StreamChunk;
						await this.writeChunk(
							stream,
							sessionId,
							messageId,
							agentId,
							"assistant",
							chunk,
						);
					} catch (err) {
						console.error("[streams/protocol] Malformed SSE chunk:", data, err);
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Agent Registration
	// ═══════════════════════════════════════════════════════════════════════

	async registerAgent(sessionId: string, agent: AgentSpec): Promise<void> {
		const state = this.sessionStates.get(sessionId);
		if (state) {
			state.agents = state.agents.filter((a) => a.id !== agent.id);
			state.agents.push(agent);

			const stream = this.streams.get(sessionId);
			if (stream) {
				await this.writeAgentRegistration(stream, sessionId, agent);
			}
		}
	}

	async registerAgents(sessionId: string, agents: AgentSpec[]): Promise<void> {
		for (const agent of agents) {
			await this.registerAgent(sessionId, agent);
		}
	}

	async unregisterAgent(sessionId: string, agentId: string): Promise<void> {
		const state = this.sessionStates.get(sessionId);
		if (state) {
			state.agents = state.agents.filter((a) => a.id !== agentId);

			const stream = this.streams.get(sessionId);
			if (stream) {
				await this.removeAgentRegistration(stream, sessionId, agentId);
			}
		}
	}

	getRegisteredAgents(sessionId: string): AgentSpec[] {
		const state = this.sessionStates.get(sessionId);
		return state?.agents ?? [];
	}

	async notifyRegisteredAgents(
		stream: DurableStream,
		sessionId: string,
		triggerType: "all" | "user-messages",
		messageHistory: Array<{ role: string; content: string }>,
	): Promise<void> {
		const agents = this.getRegisteredAgents(sessionId);

		for (const agent of agents) {
			const shouldTrigger =
				agent.triggers === "all" ||
				agent.triggers === triggerType ||
				(agent.triggers === undefined && triggerType === "user-messages");

			if (shouldTrigger) {
				this.invokeAgent(stream, sessionId, agent, messageHistory).catch(
					(err) => {
						console.error(`Failed to invoke agent ${agent.id}:`, err);
					},
				);
			}
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Active Generation Tracking
	// ═══════════════════════════════════════════════════════════════════════

	private addActiveGeneration(sessionId: string, messageId: string): void {
		const state = this.sessionStates.get(sessionId);
		if (state && !state.activeGenerations.includes(messageId)) {
			state.activeGenerations.push(messageId);
		}
	}

	private removeActiveGeneration(sessionId: string, messageId: string): void {
		const state = this.sessionStates.get(sessionId);
		if (state) {
			state.activeGenerations = state.activeGenerations.filter(
				(id) => id !== messageId,
			);
		}
	}

	stopGeneration(sessionId: string, messageId: string | null): void {
		if (messageId) {
			const controller = this.activeAbortControllers.get(messageId);
			if (controller) {
				controller.abort();
			}
		} else {
			const state = this.sessionStates.get(sessionId);
			if (state) {
				for (const id of state.activeGenerations) {
					const controller = this.activeAbortControllers.get(id);
					if (controller) {
						controller.abort();
					}
				}
			}
		}
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
