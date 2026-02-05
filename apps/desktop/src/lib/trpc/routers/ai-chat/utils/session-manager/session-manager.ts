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
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DurableStream, IdempotentProducer } from "@durable-streams/client";
import { app } from "electron";
import { buildClaudeEnv } from "../auth";

const DURABLE_STREAM_URL =
	process.env.DURABLE_STREAM_URL || "http://localhost:8080";
const DURABLE_STREAM_AUTH_TOKEN =
	process.env.DURABLE_STREAM_AUTH_TOKEN || process.env.DURABLE_STREAM_TOKEN;

function buildDurableStreamHeaders(): Record<string, string> {
	if (!DURABLE_STREAM_AUTH_TOKEN) {
		return {};
	}
	return { Authorization: `Bearer ${DURABLE_STREAM_AUTH_TOKEN}` };
}

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
	processingQueue?: Promise<void>;
}

// ============================================================================
// Durable Stream Producers (per-session)
// ============================================================================

const sessionProducers = new Map<string, IdempotentProducer>();

async function createProducer(sessionId: string): Promise<IdempotentProducer> {
	const streamOpts = {
		url: `${DURABLE_STREAM_URL}/streams/${sessionId}`,
		contentType: "application/json",
		headers: buildDurableStreamHeaders(),
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
	private seenMessageIds: Set<string> = new Set();
	private isStopped = false;
	private onNewUserMessage: (messageId: string, content: string) => void;
	private sessionId = "";
	private abortController: AbortController | null = null;
	private unsubscribe: (() => void) | null = null;
	private retryCount = 0;

	constructor(onNewUserMessage: (messageId: string, content: string) => void) {
		this.onNewUserMessage = onNewUserMessage;
	}

	/**
	 * Start watching the durable stream for new user input messages.
	 * Uses the stream API to avoid full re-fetches.
	 */
	async start(sessionId: string): Promise<void> {
		this.sessionId = sessionId;
		this.seenMessageIds.clear();
		this.isStopped = false;
		this.retryCount = 0;
		this.abortController = new AbortController();

		const streamUrl = `${DURABLE_STREAM_URL}/streams/${this.sessionId}`;
		let startOffset = "-1";

		try {
			const head = await DurableStream.head({
				url: streamUrl,
				contentType: "application/json",
				headers: buildDurableStreamHeaders(),
			});
			if (head.offset) {
				startOffset = head.offset;
			}
		} catch (error) {
			console.warn(
				`[stream-watcher] Failed to HEAD stream for ${this.sessionId}:`,
				error,
			);
		}

		try {
			const handle = new DurableStream({
				url: streamUrl,
				contentType: "application/json",
				headers: buildDurableStreamHeaders(),
			});
			const response = await handle.stream<Record<string, unknown>>({
				offset: startOffset,
				live: true,
				json: true,
				signal: this.abortController.signal,
				onError: (error: Error) => {
					const status = (error as { status?: number }).status;
					const code = (error as { code?: string }).code;
					const isFatalStatus =
						status === 401 || status === 403 || status === 404;
					const isFatalCode =
						code === "UNAUTHORIZED" ||
						code === "FORBIDDEN" ||
						code === "NOT_FOUND";

					if (isFatalStatus || isFatalCode) {
						console.warn(
							`[stream-watcher] Fatal stream error for ${this.sessionId} (status=${status ?? "n/a"}, code=${code ?? "n/a"})`,
						);
						this.stop();
						return;
					}

					this.retryCount += 1;
					if (this.retryCount > 5) {
						console.warn(
							`[stream-watcher] Retry limit exceeded for ${this.sessionId}`,
						);
						this.stop();
						return;
					}

					console.warn(
						`[stream-watcher] Stream error for ${this.sessionId} (attempt ${this.retryCount}):`,
						error,
					);
					return {};
				},
			});

			this.unsubscribe = response.subscribeJson(
				(batch: { items: ReadonlyArray<unknown> }) => {
					for (const event of batch.items) {
						if (this.isStopped) {
							return;
						}

						if (!event || typeof event !== "object") {
							continue;
						}

						const eventRecord = event as Record<string, unknown>;
						if (eventRecord.type !== "chunk") {
							continue;
						}

						const value = eventRecord.value as
							| Record<string, unknown>
							| undefined;
						if (!value || value.type !== "user_input") {
							continue;
						}

						const key = eventRecord.key as string | undefined;
						if (!key || this.seenMessageIds.has(key)) {
							continue;
						}

						this.seenMessageIds.add(key);

						const content = value.content as string | undefined;
						if (content && !this.isStopped) {
							console.log(`[stream-watcher] New user message: ${key}`);
							this.onNewUserMessage(key, content);
						}
					}
				},
			);

			this.retryCount = 0;
			console.log(
				`[stream-watcher] Started streaming for ${sessionId} (offset=${startOffset})`,
			);
		} catch (error) {
			console.warn(
				`[stream-watcher] Failed to start stream for ${this.sessionId}:`,
				error,
			);
		}
	}

	stop(): void {
		this.isStopped = true;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.abortController?.abort();
		this.abortController = null;
		this.seenMessageIds.clear();
	}
}

// ============================================================================
// Session Manager
// ============================================================================

type ClaudeQueryResult = ReturnType<typeof query>;

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

				this.enqueueUserMessage({ sessionId, messageId, content });
			});

			session.streamWatcher = watcher;
			await watcher.start(sessionId);
		}

		this.emit("event", {
			type: "session_start",
			sessionId,
		} satisfies SessionStartEvent);
	}

	private enqueueUserMessage({
		sessionId,
		messageId,
		content,
	}: {
		sessionId: string;
		messageId: string;
		content: string;
	}): void {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		const run = async () => {
			await this.processUserMessage({ sessionId, content });
		};

		const base = session.processingQueue ?? Promise.resolve();
		const next = base.catch(() => undefined).then(run);

		session.processingQueue = next
			.catch((error) => {
				console.error(
					`[claude/session] Failed to process message ${messageId}:`,
					error,
				);
			})
			.finally(() => {
				session.processingMessageIds.delete(messageId);
			});
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

		let q: ClaudeQueryResult | null = null;
		let hadError = false;

		try {
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

			q = query({ prompt: content, options });
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
				}

				totalChunks++;
			}

			console.log(
				`[claude/session] Message processing complete, ${totalChunks} chunks persisted`,
			);
		} catch (error) {
			hadError = true;
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
		} finally {
			if (hadError && !abortController.signal.aborted) {
				abortController.abort();
			}
			try {
				q?.close();
			} catch (closeError) {
				console.warn("[claude/session] Failed to close query:", closeError);
			}
			session.activeQuery = undefined;

			// Flush pending events
			const flushProducer = sessionProducers.get(sessionId);
			if (flushProducer) {
				await flushProducer.flush();
			}
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
