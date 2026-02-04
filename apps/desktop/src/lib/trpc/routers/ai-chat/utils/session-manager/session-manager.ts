/**
 * Claude Code Session Manager
 *
 * Manages Claude SDK sessions using V1 query() API with streaming.
 * Persists ALL raw SDKMessage objects to the durable stream.
 *
 * Architecture:
 * - All clients POST user messages to the durable stream
 * - This manager watches the stream for new user messages
 * - When a user message appears, it calls query() with resume for multi-turn
 * - includePartialMessages: true enables stream_event messages for live streaming
 * - ALL SDK messages are persisted as raw JSON chunks
 * - Client-side materialize() reconstructs UI state from chunks
 */

import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DurableStream, IdempotentProducer } from "@durable-streams/client";
import { app } from "electron";
import { buildClaudeEnv } from "../auth";

const DURABLE_STREAM_URL =
	process.env.DURABLE_STREAM_URL || "http://localhost:8080";

// ============================================================================
// Events (simplified — only for local IPC subscribers)
// ============================================================================

export interface SessionStartEvent {
	type: "session_start";
	sessionId: string;
}

export interface SessionEndEvent {
	type: "session_end";
	sessionId: string;
	exitCode: number | null;
}

export interface ErrorEvent {
	type: "error";
	sessionId: string;
	error: string;
}

export type ClaudeStreamEvent =
	| SessionStartEvent
	| SessionEndEvent
	| ErrorEvent;

// ============================================================================
// Active Session State
// ============================================================================

interface ActiveSession {
	sessionId: string;
	cwd: string;
	claudeSessionId?: string;
	abortController?: AbortController;
	activeQuery?: { interrupt(): Promise<void>; close(): void };
	streamWatcher?: StreamWatcher;
	processingMessageIds: Set<string>;
}

// ============================================================================
// Durable Stream Producers (per-session)
// ============================================================================

const sessionProducers = new Map<string, IdempotentProducer>();

async function createProducer(sessionId: string): Promise<IdempotentProducer> {
	const streamOpts = {
		url: `${DURABLE_STREAM_URL}/streams/${sessionId}`,
		contentType: "application/json",
	};

	let stream: DurableStream;
	try {
		stream = await DurableStream.create(streamOpts);
	} catch {
		// Stream may already exist — connect to it
		stream = await DurableStream.connect(streamOpts);
	}

	const producer = new IdempotentProducer(stream, "session-manager", {
		autoClaim: true,
		onError: (err: Error) =>
			console.error(`[durable-stream] Batch failed for ${sessionId}:`, err),
	});

	sessionProducers.set(sessionId, producer);
	return producer;
}

async function closeProducer(sessionId: string): Promise<void> {
	const producer = sessionProducers.get(sessionId);
	if (!producer) return;
	await producer.flush();
	await producer.close();
	sessionProducers.delete(sessionId);
}

// ============================================================================
// Stream Watcher
// ============================================================================

class StreamWatcher {
	private intervalId: ReturnType<typeof setInterval> | null = null;
	private seenMessageIds: Set<string> = new Set();
	private isPolling = false;
	private isStopped = false;
	private onNewUserMessage: (messageId: string, content: string) => void;
	private sessionId = "";

	constructor(onNewUserMessage: (messageId: string, content: string) => void) {
		this.onNewUserMessage = onNewUserMessage;
	}

	/**
	 * Fetch the current stream and seed seenMessageIds with all existing
	 * user_input keys, then start polling for new messages.
	 * This prevents reprocessing historical messages after a restart.
	 */
	async start(sessionId: string): Promise<void> {
		this.sessionId = sessionId;
		this.seenMessageIds.clear();
		this.isStopped = false;

		// Seed with existing messages before polling
		await this.seedExistingMessages();

		this.intervalId = setInterval(() => this.poll(), 500);
		console.log(
			`[stream-watcher] Started polling for ${sessionId} (${this.seenMessageIds.size} existing messages seeded)`,
		);
	}

	/**
	 * Fetch all existing events from the stream and record their keys
	 * so they are not treated as new messages.
	 */
	private async seedExistingMessages(): Promise<void> {
		try {
			const response = await fetch(
				`${DURABLE_STREAM_URL}/streams/${this.sessionId}`,
				{ headers: { Accept: "application/json" } },
			);

			if (!response.ok) return;

			const events = (await response.json()) as Array<Record<string, unknown>>;

			for (const event of events) {
				if (event.type !== "chunk") continue;

				const value = event.value as Record<string, unknown> | undefined;
				if (!value || value.type !== "user_input") continue;

				const key = event.key as string;
				if (key) {
					this.seenMessageIds.add(key);
				}
			}
		} catch (error) {
			console.warn(
				`[stream-watcher] Failed to seed existing messages for ${this.sessionId}:`,
				error,
			);
		}
	}

	private async poll(): Promise<void> {
		if (this.isStopped) return;
		if (this.isPolling) return;
		this.isPolling = true;

		try {
			const response = await fetch(
				`${DURABLE_STREAM_URL}/streams/${this.sessionId}`,
				{ headers: { Accept: "application/json" } },
			);

			if (!response.ok) return;

			const events = (await response.json()) as Array<Record<string, unknown>>;

			for (const event of events) {
				if (event.type !== "chunk") continue;

				const value = event.value as Record<string, unknown> | undefined;
				if (!value) continue;

				// Detect user input messages (new format: { type: "user_input", content, ... })
				if (value.type !== "user_input") continue;

				const key = event.key as string;
				if (!key || this.seenMessageIds.has(key)) continue;

				this.seenMessageIds.add(key);

				const content = value.content as string | undefined;
				if (content && !this.isStopped) {
					console.log(`[stream-watcher] New user message: ${key}`);
					this.onNewUserMessage(key, content);
				}
			}
		} catch {
			// Ignore poll errors
		} finally {
			this.isPolling = false;
		}
	}

	stop(): void {
		this.isStopped = true;
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		this.seenMessageIds.clear();
	}
}

// ============================================================================
// Session Manager
// ============================================================================

// Cache V1 SDK query function
let cachedQuery:
	| typeof import("@anthropic-ai/claude-agent-sdk").query
	| null = null;

const getSDK = async () => {
	if (cachedQuery) return { query: cachedQuery };
	const sdk = await import("@anthropic-ai/claude-agent-sdk");
	cachedQuery = sdk.query;
	return { query: cachedQuery };
};

class ClaudeSessionManager extends EventEmitter {
	private sessions: Map<string, ActiveSession> = new Map();

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

		if (enableDurableStream) {
			try {
				await createProducer(sessionId);
				console.log(`[claude/session] Durable stream created for ${sessionId}`);
			} catch (error) {
				console.error(`[claude/session] Failed to create stream:`, error);
			}
		}

		const session: ActiveSession = {
			sessionId,
			cwd,
			claudeSessionId,
			processingMessageIds: new Set(),
		};

		this.sessions.set(sessionId, session);

		if (sessionProducers.has(sessionId)) {
			const watcher = new StreamWatcher((messageId, content) => {
				if (session.processingMessageIds.has(messageId)) {
					return;
				}
				session.processingMessageIds.add(messageId);

				this.processUserMessage({ sessionId, content }).finally(() => {
					session.processingMessageIds.delete(messageId);
				});
			});

			session.streamWatcher = watcher;
			await watcher.start(sessionId);
		}

		this.emit("event", {
			type: "session_start",
			sessionId,
		} satisfies SessionStartEvent);
	}

	/**
	 * Process a user message through Claude using V1 query() API.
	 * Uses includePartialMessages for real-time streaming events.
	 * Persists ALL raw SDKMessage objects to the durable stream.
	 */
	private async processUserMessage({
		sessionId,
		content,
	}: {
		sessionId: string;
		content: string;
	}): Promise<void> {
		console.log(
			`[claude/session] processUserMessage for ${sessionId}: "${content.slice(0, 50)}..."`,
		);

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

		// Abort any previous in-flight query
		if (session.activeQuery) {
			session.activeQuery.close();
			session.activeQuery = undefined;
		}

		const abortController = new AbortController();
		session.abortController = abortController;

		const binaryName = process.platform === "win32" ? "claude.exe" : "claude";
		const binaryPath = app.isPackaged
			? join(process.resourcesPath, "bin", binaryName)
			: join(
					app.getAppPath(),
					"resources",
					"bin",
					`${process.platform}-${process.arch}`,
					binaryName,
				);
		if (!existsSync(binaryPath)) {
			this.emit("event", {
				type: "error",
				sessionId,
				error: "Claude binary not found",
			} satisfies ErrorEvent);
			return;
		}

		const env = buildClaudeEnv();

		try {
			const { query } = await getSDK();

			const options = {
				includePartialMessages: true,
				cwd: session.cwd,
				resume: session.claudeSessionId,
				model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
				pathToClaudeCodeExecutable: binaryPath,
				env,
				permissionMode: "bypassPermissions" as const,
				abortController,
			};

			console.log(
				`[claude/session] Starting V1 query in ${session.cwd} (resume=${session.claudeSessionId || "none"})`,
			);

			const q = query({ prompt: content, options });
			session.activeQuery = q;

			// Stream and persist ALL SDK messages as raw passthrough.
			// includePartialMessages: true gives us stream_event messages for live streaming.
			// Turn detection happens client-side in materialize().
			let totalChunks = 0;
			let seq = 0;

			for await (const msg of q) {
				if (abortController.signal.aborted) {
					console.log(`[claude/session] Stream aborted`);
					break;
				}

				const msgAny = msg as Record<string, unknown>;
				const msgType = msgAny.type as string;
				console.log(
					`[claude/session] SDK message #${seq}: type=${msgType}${msgType === "stream_event" ? ` event=${(msgAny.event as Record<string, unknown>)?.type}` : ""}`,
				);

				// Extract session ID from init message
				if (msgType === "system" && msgAny.subtype === "init") {
					const sdkSessionId = msgAny.session_id as string | undefined;
					if (sdkSessionId) {
						session.claudeSessionId = sdkSessionId;
						console.log(
							`[claude/session] Got Claude session ID: ${sdkSessionId}`,
						);
					}
				}

				// Persist raw SDK message with ordering metadata
				const producer = sessionProducers.get(sessionId);
				if (producer) {
					const uuid = (msgAny.uuid as string) || crypto.randomUUID();
					producer.append(
						JSON.stringify({
							type: "chunk",
							key: uuid,
							value: {
								...(msg as Record<string, unknown>),
								createdAt: new Date().toISOString(),
								_seq: seq++,
							},
							headers: { operation: "upsert" },
						}),
					);
					// Flush immediately so chunks are visible to clients as they arrive
					await producer.flush();
				}

				totalChunks++;
			}

			q.close();
			session.activeQuery = undefined;

			// Flush pending events
			const flushProducer = sessionProducers.get(sessionId);
			if (flushProducer) {
				await flushProducer.flush();
			}

			console.log(
				`[claude/session] Message processing complete, ${totalChunks} chunks persisted`,
			);
		} catch (error) {
			session.activeQuery = undefined;
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(`[claude/session] SDK error: ${errorMessage}`);
			if (error instanceof Error && error.stack) {
				console.error(`[claude/session] Stack:`, error.stack);
			}
			this.emit("event", {
				type: "error",
				sessionId,
				error: errorMessage,
			} satisfies ErrorEvent);
		}
	}

	async interrupt({ sessionId }: { sessionId: string }): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			console.warn(
				`[claude/session] Session ${sessionId} not found for interrupt`,
			);
			return;
		}

		console.log(`[claude/session] Interrupting session ${sessionId}`);
		if (session.activeQuery) {
			await session.activeQuery.interrupt();
		}
		session.abortController?.abort();
	}

	async stopSession({ sessionId }: { sessionId: string }): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		console.log(`[claude/session] Stopping session ${sessionId}`);
		session.activeQuery?.close();
		session.activeQuery = undefined;
		session.abortController?.abort();
		session.streamWatcher?.stop();
		this.sessions.delete(sessionId);
		await closeProducer(sessionId);
	}

	isSessionActive(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	getActiveSessions(): string[] {
		return Array.from(this.sessions.keys());
	}
}

export const claudeSessionManager = new ClaudeSessionManager();
