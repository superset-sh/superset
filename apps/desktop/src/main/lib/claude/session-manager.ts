/**
 * Claude Code Session Manager
 *
 * Manages Claude SDK sessions using @anthropic-ai/claude-agent-sdk.
 * Streams events for real-time UI updates.
 *
 * Streams tokens to:
 * 1. Local EventEmitter for desktop tRPC subscription
 * 2. Durable Stream server for multi-client sync
 */

import { EventEmitter } from "node:events";
import { buildClaudeEnv, getClaudeBinaryPath } from "./index";

// Durable Stream server URL - configurable via env
const DURABLE_STREAM_URL =
	process.env.DURABLE_STREAM_URL || "http://localhost:8080";

// Stream event types for UI updates
export interface TextDeltaEvent {
	type: "text_delta";
	sessionId: string;
	text: string;
}

export interface ToolUseStartEvent {
	type: "tool_use_start";
	sessionId: string;
	toolName: string;
	toolId: string;
}

export interface ToolUseDeltaEvent {
	type: "tool_use_delta";
	sessionId: string;
	toolId: string;
	partialJson: string;
}

export interface ToolUseEndEvent {
	type: "tool_use_end";
	sessionId: string;
	toolId: string;
}

export interface MessageCompleteEvent {
	type: "message_complete";
	sessionId: string;
	content: string;
	toolCalls?: unknown[];
	inputTokens?: number;
	outputTokens?: number;
	claudeSessionId?: string;
}

export interface ErrorEvent {
	type: "error";
	sessionId: string;
	error: string;
}

export interface SessionStartEvent {
	type: "session_start";
	sessionId: string;
}

export interface SessionEndEvent {
	type: "session_end";
	sessionId: string;
	exitCode: number | null;
}

export type ClaudeStreamEvent =
	| TextDeltaEvent
	| ToolUseStartEvent
	| ToolUseDeltaEvent
	| ToolUseEndEvent
	| MessageCompleteEvent
	| ErrorEvent
	| SessionStartEvent
	| SessionEndEvent;

interface ActiveSession {
	sessionId: string;
	cwd: string;
	claudeSessionId?: string;
	abortController?: AbortController;
	accumulatedContent: string;
	toolCalls: unknown[];
	streamEnabled: boolean;
	// Maps content block index to tool ID for matching tool_use_end events
	toolIndexToId: Map<number, string>;
}

// Cache the SDK query function
let cachedClaudeQuery: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null;
const getClaudeQuery = async () => {
	if (cachedClaudeQuery) {
		return cachedClaudeQuery;
	}
	const sdk = await import("@anthropic-ai/claude-agent-sdk");
	cachedClaudeQuery = sdk.query;
	return cachedClaudeQuery;
};

/**
 * Durable Stream client for posting events to the stream server
 */
class DurableStreamClient {
	private baseUrl: string;
	private eventQueue: Map<string, Array<Record<string, unknown>>> = new Map();
	private flushTimeouts: Map<string, NodeJS.Timeout> = new Map();

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl;
	}

	async createStream(sessionId: string): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/streams/${sessionId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
			});
			return response.ok;
		} catch (error) {
			console.error(`[durable-stream] Failed to create stream:`, error);
			return false;
		}
	}

	queueEvent(sessionId: string, event: Record<string, unknown>): void {
		let queue = this.eventQueue.get(sessionId);
		if (!queue) {
			queue = [];
			this.eventQueue.set(sessionId, queue);
		}

		queue.push({
			...event,
			timestamp: Date.now(),
		});

		const existingTimeout = this.flushTimeouts.get(sessionId);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		if (queue.length >= 10) {
			this.flushEvents(sessionId);
		} else {
			const timeout = setTimeout(() => this.flushEvents(sessionId), 50);
			this.flushTimeouts.set(sessionId, timeout);
		}
	}

	private async flushEvents(sessionId: string): Promise<void> {
		const queue = this.eventQueue.get(sessionId);
		if (!queue || queue.length === 0) return;

		this.eventQueue.set(sessionId, []);
		this.flushTimeouts.delete(sessionId);

		try {
			await fetch(`${this.baseUrl}/streams/${sessionId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(queue),
			});
		} catch (error) {
			console.error(`[durable-stream] Failed to post events:`, error);
			const currentQueue = this.eventQueue.get(sessionId) || [];
			this.eventQueue.set(sessionId, [...queue, ...currentQueue]);
		}
	}

	async flushAll(sessionId: string): Promise<void> {
		const timeout = this.flushTimeouts.get(sessionId);
		if (timeout) {
			clearTimeout(timeout);
			this.flushTimeouts.delete(sessionId);
		}
		await this.flushEvents(sessionId);
	}

	cleanup(sessionId: string): void {
		this.eventQueue.delete(sessionId);
		const timeout = this.flushTimeouts.get(sessionId);
		if (timeout) {
			clearTimeout(timeout);
			this.flushTimeouts.delete(sessionId);
		}
	}
}

const durableStreamClient = new DurableStreamClient(DURABLE_STREAM_URL);

class ClaudeSessionManager extends EventEmitter {
	private sessions: Map<string, ActiveSession> = new Map();

	/**
	 * Start a new Claude session.
	 */
	async startSession({
		sessionId,
		cwd,
		claudeSessionId,
		enableDurableStream = true,
	}: {
		sessionId: string;
		cwd: string;
		claudeSessionId?: string;
		enableDurableStream?: boolean;
	}): Promise<void> {
		if (this.sessions.has(sessionId)) {
			console.warn(`[claude/session] Session ${sessionId} already running`);
			return;
		}

		console.log(`[claude/session] Initializing session ${sessionId} in ${cwd}`);

		let streamEnabled = false;
		if (enableDurableStream) {
			streamEnabled = await durableStreamClient.createStream(sessionId);
			if (streamEnabled) {
				console.log(`[claude/session] Durable stream created for ${sessionId}`);
			}
		}

		const session: ActiveSession = {
			sessionId,
			cwd,
			claudeSessionId,
			accumulatedContent: "",
			toolCalls: [],
			streamEnabled,
			toolIndexToId: new Map(),
		};

		this.sessions.set(sessionId, session);

		this.emitEvent(session, {
			type: "session_start",
			sessionId,
		} satisfies SessionStartEvent);
	}

	/**
	 * Send a message to an active session using the Claude Agent SDK.
	 */
	async sendMessage({
		sessionId,
		content,
	}: {
		sessionId: string;
		content: string;
	}): Promise<void> {
		console.log(`[claude/session] sendMessage called for ${sessionId}: "${content.slice(0, 50)}..."`);

		const session = this.sessions.get(sessionId);
		if (!session) {
			console.error(`[claude/session] Session ${sessionId} not found`);
			this.emit("event", {
				type: "error",
				sessionId,
				error: "Session not found",
			} satisfies ErrorEvent);
			return;
		}

		// Abort any existing request for this session
		if (session.abortController) {
			session.abortController.abort();
		}

		const abortController = new AbortController();
		session.abortController = abortController;
		session.accumulatedContent = "";
		session.toolCalls = [];
		session.toolIndexToId.clear();

		const binaryPath = getClaudeBinaryPath();
		if (!binaryPath) {
			this.emitEvent(session, {
				type: "error",
				sessionId,
				error: "Claude binary not found",
			} satisfies ErrorEvent);
			return;
		}

		const env = buildClaudeEnv();

		try {
			const claudeQuery = await getClaudeQuery();

			console.log(`[claude/session] Starting SDK query in ${session.cwd}`);
			console.log(`[claude/session] Binary: ${binaryPath}`);
			console.log(`[claude/session] Resume session: ${session.claudeSessionId || "none"}`);

			const queryOptions = {
				prompt: content,
				options: {
					abortController,
					cwd: session.cwd,
					env,
					pathToClaudeCodeExecutable: binaryPath,
					permissionMode: "bypassPermissions" as const,
					allowDangerouslySkipPermissions: true,
					// Match 1code's configuration for proper tool use
					systemPrompt: {
						type: "preset" as const,
						preset: "claude_code" as const,
					},
					includePartialMessages: true,
					settingSources: ["project" as const, "user" as const],
					...(session.claudeSessionId && {
						resume: session.claudeSessionId,
						continue: true,
					}),
				},
			};

			const stream = claudeQuery(queryOptions);

			for await (const msg of stream) {
				if (abortController.signal.aborted) {
					console.log(`[claude/session] Stream aborted`);
					break;
				}

				this.processSDKMessage(sessionId, session, msg);
			}

			// Emit message complete when stream ends
			if (session.accumulatedContent) {
				this.emitEvent(session, {
					type: "message_complete",
					sessionId,
					content: session.accumulatedContent,
					toolCalls: session.toolCalls.length > 0 ? session.toolCalls : undefined,
					claudeSessionId: session.claudeSessionId,
				} satisfies MessageCompleteEvent);
			}

			// Flush any pending events to the durable stream
			if (session.streamEnabled) {
				await durableStreamClient.flushAll(sessionId);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			console.error(`[claude/session] SDK error: ${errorMessage}`);
			if (errorStack) {
				console.error(`[claude/session] Stack:`, errorStack);
			}
			// If it's an object with more details, log those too
			if (typeof error === "object" && error !== null) {
				console.error(`[claude/session] Full error:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
			}
			this.emitEvent(session, {
				type: "error",
				sessionId,
				error: errorMessage,
			} satisfies ErrorEvent);
		}
	}

	/**
	 * Process a message from the Claude Agent SDK.
	 */
	private processSDKMessage(
		sessionId: string,
		session: ActiveSession,
		msg: unknown,
	): void {
		const msgAny = msg as Record<string, unknown>;
		const msgType = msgAny.type as string;
		const subtype = msgAny.subtype as string | undefined;

		// Verbose logging for debugging - stringify the full message
		console.log(`[claude/session] SDK message: type=${msgType}, subtype=${subtype || "none"}, full:`, JSON.stringify(msg, null, 2).slice(0, 500));

		// Handle session ID from init message
		if (msgType === "system" && subtype === "init") {
			const sdkSessionId = msgAny.session_id as string | undefined;
			if (sdkSessionId) {
				session.claudeSessionId = sdkSessionId;
				console.log(`[claude/session] Got Claude session ID: ${sdkSessionId}`);
			}
			return;
		}

		// Handle error messages
		if (msgType === "error" || msgAny.error) {
			let errorText: string;
			if (typeof msgAny.error === "object" && msgAny.error !== null) {
				const errorObj = msgAny.error as Record<string, unknown>;
				errorText = errorObj.message?.toString() || JSON.stringify(errorObj);
			} else {
				errorText = msgAny.message?.toString() || msgAny.error?.toString() || "Unknown error";
			}
			console.error(`[claude/session] SDK error message:`, errorText);
			console.error(`[claude/session] Full error msg:`, JSON.stringify(msgAny, null, 2).slice(0, 1000));
			this.emitEvent(session, {
				type: "error",
				sessionId,
				error: errorText,
			} satisfies ErrorEvent);
			return;
		}

		// Handle streaming events
		if (msgType === "assistant" && subtype === "message") {
			const message = msgAny.message as Record<string, unknown> | undefined;
			const content = message?.content as Array<Record<string, unknown>> | undefined;

			if (content) {
				for (const block of content) {
					if (block.type === "text" && typeof block.text === "string") {
						session.accumulatedContent += block.text;
						this.emitEvent(session, {
							type: "text_delta",
							sessionId,
							text: block.text,
						} satisfies TextDeltaEvent);
					} else if (block.type === "tool_use") {
						const toolName = block.name as string || "unknown";
						const toolId = block.id as string || "unknown";
						session.toolCalls.push(block);
						this.emitEvent(session, {
							type: "tool_use_start",
							sessionId,
							toolName,
							toolId,
						} satisfies ToolUseStartEvent);
					}
				}
			}
			return;
		}

		// Handle raw streaming deltas from the event property
		const event = msgAny.event as Record<string, unknown> | undefined;
		if (event) {
			const eventType = event.type as string;

			if (eventType === "content_block_delta") {
				const delta = event.delta as Record<string, unknown> | undefined;
				if (delta?.type === "text_delta" && typeof delta.text === "string") {
					session.accumulatedContent += delta.text;
					this.emitEvent(session, {
						type: "text_delta",
						sessionId,
						text: delta.text,
					} satisfies TextDeltaEvent);
				}
			} else if (eventType === "content_block_start") {
				const contentBlock = event.content_block as Record<string, unknown> | undefined;
				const blockIndex = event.index as number | undefined;
				if (contentBlock?.type === "tool_use") {
					const toolId = (contentBlock.id as string) || "unknown";
					// Store index→toolId mapping for matching tool_use_end events
					if (blockIndex !== undefined) {
						session.toolIndexToId.set(blockIndex, toolId);
					}
					this.emitEvent(session, {
						type: "tool_use_start",
						sessionId,
						toolName: (contentBlock.name as string) || "unknown",
						toolId,
					} satisfies ToolUseStartEvent);
				}
			} else if (eventType === "content_block_stop") {
				const index = event.index as number | undefined;
				if (index !== undefined) {
					// Look up the actual toolId from our mapping
					const toolId = session.toolIndexToId.get(index);
					if (toolId) {
						this.emitEvent(session, {
							type: "tool_use_end",
							sessionId,
							toolId,
						} satisfies ToolUseEndEvent);
						// Clean up the mapping
						session.toolIndexToId.delete(index);
					}
				}
			}
		}

		// Handle result messages
		if (msgType === "result") {
			const result = msgAny.result as string | undefined;
			if (result && !session.accumulatedContent) {
				session.accumulatedContent = result;
			}
		}
	}

	/**
	 * Interrupt an active session.
	 */
	async interrupt({ sessionId }: { sessionId: string }): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			console.warn(`[claude/session] Session ${sessionId} not found for interrupt`);
			return;
		}

		console.log(`[claude/session] Interrupting session ${sessionId}`);
		session.abortController?.abort();
	}

	/**
	 * Stop a session completely.
	 */
	async stopSession({ sessionId }: { sessionId: string }): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		console.log(`[claude/session] Stopping session ${sessionId}`);
		session.abortController?.abort();
		this.sessions.delete(sessionId);
		durableStreamClient.cleanup(sessionId);
	}

	/**
	 * Check if a session is active.
	 */
	isSessionActive(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	/**
	 * Get all active session IDs.
	 */
	getActiveSessions(): string[] {
		return Array.from(this.sessions.keys());
	}

	/**
	 * Emit an event both locally and to the durable stream
	 */
	private emitEvent(session: ActiveSession, event: ClaudeStreamEvent): void {
		this.emit("event", event);

		if (session.streamEnabled) {
			const { sessionId: _, ...streamEvent } = event;
			durableStreamClient.queueEvent(session.sessionId, streamEvent);
		}
	}
}

// Singleton instance
export const claudeSessionManager = new ClaudeSessionManager();
