/**
 * Claude Code Session Manager
 *
 * Manages Claude SDK sessions, spawning the bundled binary with user auth
 * and streaming events for real-time UI updates.
 *
 * Streams tokens to:
 * 1. Local EventEmitter for desktop tRPC subscription
 * 2. Durable Stream server for multi-client sync
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { buildClaudeEnv, getClaudeBinaryPath } from "./index";

// Durable Stream server URL - configurable via env
const DURABLE_STREAM_URL = process.env.DURABLE_STREAM_URL || "http://localhost:8080";

// Stream event types matching Claude SDK's streaming format
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
	process: ChildProcess;
	cwd: string;
	claudeSessionId?: string;
	accumulatedContent: string;
	toolCalls: unknown[];
	streamEnabled: boolean;
}

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

	/**
	 * Create a stream for a session
	 */
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

	/**
	 * Queue an event and batch-send to reduce network overhead
	 */
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

		// Debounce flush - send after 50ms of no new events, or immediately if queue is large
		const existingTimeout = this.flushTimeouts.get(sessionId);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		if (queue.length >= 10) {
			// Flush immediately if queue is large
			this.flushEvents(sessionId);
		} else {
			// Otherwise debounce
			const timeout = setTimeout(() => this.flushEvents(sessionId), 50);
			this.flushTimeouts.set(sessionId, timeout);
		}
	}

	/**
	 * Flush queued events to the stream server
	 */
	private async flushEvents(sessionId: string): Promise<void> {
		const queue = this.eventQueue.get(sessionId);
		if (!queue || queue.length === 0) return;

		// Clear queue and timeout
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
			// On failure, re-queue events
			const currentQueue = this.eventQueue.get(sessionId) || [];
			this.eventQueue.set(sessionId, [...queue, ...currentQueue]);
		}
	}

	/**
	 * Force flush all pending events for a session
	 */
	async flushAll(sessionId: string): Promise<void> {
		const timeout = this.flushTimeouts.get(sessionId);
		if (timeout) {
			clearTimeout(timeout);
			this.flushTimeouts.delete(sessionId);
		}
		await this.flushEvents(sessionId);
	}
}

const durableStreamClient = new DurableStreamClient(DURABLE_STREAM_URL);

class ClaudeSessionManager extends EventEmitter {
	private sessions: Map<string, ActiveSession> = new Map();

	/**
	 * Start a new Claude session or resume an existing one.
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
		// Check if session already running
		if (this.sessions.has(sessionId)) {
			console.warn(`[claude/session] Session ${sessionId} already running`);
			return;
		}

		const binaryPath = getClaudeBinaryPath();
		if (!binaryPath) {
			this.emit("event", {
				type: "error",
				sessionId,
				error: "Claude binary not found",
			} satisfies ErrorEvent);
			return;
		}

		const env = buildClaudeEnv();

		// Build command args
		const args: string[] = ["--output-format", "stream-json"];

		if (claudeSessionId) {
			args.push("--resume", claudeSessionId);
		}

		console.log(`[claude/session] Starting session ${sessionId} in ${cwd}`);
		console.log(`[claude/session] Binary: ${binaryPath}`);
		console.log(`[claude/session] Args: ${args.join(" ")}`);

		// Create durable stream for multi-client sync
		let streamEnabled = false;
		if (enableDurableStream) {
			streamEnabled = await durableStreamClient.createStream(sessionId);
			if (streamEnabled) {
				console.log(`[claude/session] Durable stream created for ${sessionId}`);
			} else {
				console.warn(`[claude/session] Failed to create durable stream, continuing without it`);
			}
		}

		const proc = spawn(binaryPath, args, {
			cwd,
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const session: ActiveSession = {
			sessionId,
			process: proc,
			cwd,
			claudeSessionId,
			accumulatedContent: "",
			toolCalls: [],
			streamEnabled,
		};

		this.sessions.set(sessionId, session);

		this.emitEvent(session, {
			type: "session_start",
			sessionId,
		} satisfies SessionStartEvent);

		// Handle stdout (streaming JSON events)
		proc.stdout?.on("data", (data: Buffer) => {
			this.handleStreamData(sessionId, data);
		});

		// Handle stderr (errors and logs)
		proc.stderr?.on("data", (data: Buffer) => {
			const text = data.toString();
			console.error(`[claude/session] stderr: ${text}`);
		});

		// Handle process exit
		proc.on("close", async (code) => {
			console.log(`[claude/session] Session ${sessionId} exited with code ${code}`);

			const currentSession = this.sessions.get(sessionId);
			if (currentSession) {
				// Emit message complete if we accumulated content
				if (currentSession.accumulatedContent) {
					this.emitEvent(currentSession, {
						type: "message_complete",
						sessionId,
						content: currentSession.accumulatedContent,
						toolCalls:
							currentSession.toolCalls.length > 0
								? currentSession.toolCalls
								: undefined,
						claudeSessionId: currentSession.claudeSessionId,
					} satisfies MessageCompleteEvent);
				}

				this.emitEvent(currentSession, {
					type: "session_end",
					sessionId,
					exitCode: code,
				} satisfies SessionEndEvent);

				// Flush any pending events to the durable stream
				if (currentSession.streamEnabled) {
					await durableStreamClient.flushAll(sessionId);
				}
			}

			this.sessions.delete(sessionId);
		});

		proc.on("error", (error) => {
			console.error(`[claude/session] Process error:`, error);
			const currentSession = this.sessions.get(sessionId);
			if (currentSession) {
				this.emitEvent(currentSession, {
					type: "error",
					sessionId,
					error: error.message,
				} satisfies ErrorEvent);
			} else {
				// No session yet, just emit locally
				this.emit("event", {
					type: "error",
					sessionId,
					error: error.message,
				} satisfies ErrorEvent);
			}
		});
	}

	/**
	 * Send a message to an active session.
	 */
	async sendMessage({
		sessionId,
		content,
	}: {
		sessionId: string;
		content: string;
	}): Promise<void> {
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

		// Reset accumulated content for new message
		session.accumulatedContent = "";
		session.toolCalls = [];

		// Write to stdin
		session.process.stdin?.write(content + "\n");
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
		session.process.kill("SIGINT");
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
		session.process.kill("SIGTERM");
		this.sessions.delete(sessionId);
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
		// Always emit locally for desktop tRPC subscription
		this.emit("event", event);

		// Also post to durable stream for multi-client sync
		if (session.streamEnabled) {
			// Strip sessionId from event for durable stream (it's implicit in the stream)
			const { sessionId: _, ...streamEvent } = event;
			durableStreamClient.queueEvent(session.sessionId, streamEvent);
		}
	}

	/**
	 * Handle streaming JSON data from Claude.
	 */
	private handleStreamData(sessionId: string, data: Buffer): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;

		const text = data.toString();
		const lines = text.split("\n").filter((line) => line.trim());

		for (const line of lines) {
			try {
				const event = JSON.parse(line);
				this.processStreamEvent(sessionId, session, event);
			} catch {
				// Not JSON, might be raw text output
				console.log(`[claude/session] Non-JSON output: ${line}`);
			}
		}
	}

	/**
	 * Process a parsed stream event from Claude.
	 */
	private processStreamEvent(
		sessionId: string,
		session: ActiveSession,
		event: Record<string, unknown>,
	): void {
		// Handle different event types from Claude's streaming format
		const eventType = event.type as string;

		switch (eventType) {
			case "content_block_delta": {
				const delta = event.delta as Record<string, unknown> | undefined;
				if (delta?.type === "text_delta" && typeof delta.text === "string") {
					session.accumulatedContent += delta.text;
					this.emitEvent(session, {
						type: "text_delta",
						sessionId,
						text: delta.text,
					} satisfies TextDeltaEvent);
				} else if (
					delta?.type === "input_json_delta" &&
					typeof delta.partial_json === "string"
				) {
					this.emitEvent(session, {
						type: "tool_use_delta",
						sessionId,
						toolId: (event.index as string) ?? "unknown",
						partialJson: delta.partial_json,
					} satisfies ToolUseDeltaEvent);
				}
				break;
			}

			case "content_block_start": {
				const contentBlock = event.content_block as
					| Record<string, unknown>
					| undefined;
				if (contentBlock?.type === "tool_use") {
					this.emitEvent(session, {
						type: "tool_use_start",
						sessionId,
						toolName: (contentBlock.name as string) ?? "unknown",
						toolId: (contentBlock.id as string) ?? "unknown",
					} satisfies ToolUseStartEvent);
				}
				break;
			}

			case "content_block_stop": {
				// Tool use might have completed
				const index = event.index;
				if (typeof index === "number" || typeof index === "string") {
					this.emitEvent(session, {
						type: "tool_use_end",
						sessionId,
						toolId: String(index),
					} satisfies ToolUseEndEvent);
				}
				break;
			}

			case "message_delta": {
				// Message is completing, might have usage info
				const usage = event.usage as Record<string, number> | undefined;
				if (usage) {
					// We'll emit this in the message_stop handler
				}
				break;
			}

			case "message_stop": {
				// Full message complete
				this.emitEvent(session, {
					type: "message_complete",
					sessionId,
					content: session.accumulatedContent,
					toolCalls:
						session.toolCalls.length > 0 ? session.toolCalls : undefined,
					claudeSessionId: session.claudeSessionId,
				} satisfies MessageCompleteEvent);
				break;
			}

			case "session_id": {
				// Claude CLI sent us the session ID for resume
				const claudeSessionId = event.session_id as string | undefined;
				if (claudeSessionId) {
					session.claudeSessionId = claudeSessionId;
					console.log(
						`[claude/session] Got Claude session ID: ${claudeSessionId}`,
					);
				}
				break;
			}

			case "error": {
				const errorMsg =
					(event.error as Record<string, unknown>)?.message ?? "Unknown error";
				this.emitEvent(session, {
					type: "error",
					sessionId,
					error: String(errorMsg),
				} satisfies ErrorEvent);
				break;
			}

			default:
				// Unknown event type, log for debugging
				console.log(`[claude/session] Unknown event type: ${eventType}`, event);
		}
	}
}

// Singleton instance
export const claudeSessionManager = new ClaudeSessionManager();
