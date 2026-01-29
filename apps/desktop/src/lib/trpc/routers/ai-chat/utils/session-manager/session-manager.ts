/**
 * Claude Code Session Manager
 *
 * Manages Claude SDK sessions using V2 session API.
 * Persists ALL raw SDKMessage objects to the durable stream.
 *
 * Architecture:
 * - All clients POST user messages to the durable stream
 * - This manager watches the stream for new user messages
 * - When a user message appears, it creates/resumes a V2 SDK session
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
	private onNewUserMessage: (messageId: string, content: string) => void;
	private sessionId = "";

	constructor(onNewUserMessage: (messageId: string, content: string) => void) {
		this.onNewUserMessage = onNewUserMessage;
	}

	start(sessionId: string): void {
		this.sessionId = sessionId;
		this.seenMessageIds.clear();
		this.intervalId = setInterval(() => this.poll(), 500);
		console.log(`[stream-watcher] Started polling for ${sessionId}`);
	}

	private async poll(): Promise<void> {
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
				if (content) {
					console.log(`[stream-watcher] New user message: ${key}`);
					this.onNewUserMessage(key, content);
				}
			}
		} catch {
			// Ignore poll errors
		}
	}

	stop(): void {
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

// Cache V2 SDK functions
let cachedCreateSession:
	| typeof import("@anthropic-ai/claude-agent-sdk").unstable_v2_createSession
	| null = null;
let cachedResumeSession:
	| typeof import("@anthropic-ai/claude-agent-sdk").unstable_v2_resumeSession
	| null = null;

const getV2SDK = async () => {
	if (cachedCreateSession && cachedResumeSession) {
		return {
			createSession: cachedCreateSession,
			resumeSession: cachedResumeSession,
		};
	}
	const sdk = await import("@anthropic-ai/claude-agent-sdk");
	cachedCreateSession = sdk.unstable_v2_createSession;
	cachedResumeSession = sdk.unstable_v2_resumeSession;
	return {
		createSession: cachedCreateSession,
		resumeSession: cachedResumeSession,
	};
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
			watcher.start(sessionId);
		}

		this.emit("event", {
			type: "session_start",
			sessionId,
		} satisfies SessionStartEvent);
	}

	/**
	 * Process a user message through Claude using V2 session API.
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

		if (session.abortController) {
			session.abortController.abort();
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
			const { createSession, resumeSession } = await getV2SDK();

			const sessionOptions = {
				model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929",
				pathToClaudeCodeExecutable: binaryPath,
				env,
				permissionMode: "bypassPermissions" as const,
			};

			console.log(`[claude/session] Starting V2 SDK session in ${session.cwd}`);
			console.log(
				`[claude/session] Resume session: ${session.claudeSessionId || "none"}`,
			);

			const sdkSession = session.claudeSessionId
				? resumeSession(session.claudeSessionId, sessionOptions)
				: createSession(sessionOptions);

			// Send user message
			await sdkSession.send(content);

			// Stream and persist ALL SDK messages as raw passthrough.
			// No envelope — each SDK message is stored directly.
			// Turn detection happens client-side in materialize().
			let totalChunks = 0;
			let seq = 0;

			for await (const msg of sdkSession.stream()) {
				if (abortController.signal.aborted) {
					console.log(`[claude/session] Stream aborted`);
					break;
				}

				const msgAny = msg as Record<string, unknown>;
				const msgType = msgAny.type as string;

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

			sdkSession.close();

			// Flush pending events
			const flushProducer = sessionProducers.get(sessionId);
			if (flushProducer) {
				await flushProducer.flush();
			}

			console.log(
				`[claude/session] Message processing complete, ${totalChunks} chunks persisted`,
			);
		} catch (error) {
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
		session.abortController?.abort();
	}

	async stopSession({ sessionId }: { sessionId: string }): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			return;
		}

		console.log(`[claude/session] Stopping session ${sessionId}`);
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
