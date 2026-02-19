import { EventEmitter } from "node:events";
import { DurableStream, IdempotentProducer } from "@durable-streams/client";
import type { UIMessage, UIMessageChunk } from "ai";
import { type ChunkRow, sessionStateSchema } from "../schema";
import { createSessionDB, type SessionDB } from "../session-db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionHostOptions {
	sessionId: string;
	/** Proxy base URL (e.g. "https://api.example.com/api/chat"). All reads and writes go through the proxy. */
	baseUrl: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

export interface SessionHostConfig {
	model?: string;
	cwd?: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
	availableModels?: Array<{ id: string; name: string; provider: string }>;
	slashCommands?: Array<{
		name: string;
		description: string;
		argumentHint: string;
	}>;
}

export interface SessionHostEventMap {
	message: [data: { messageId: string; message: UIMessage }];
	toolApproval: [
		data: {
			approvalId: string;
			approved: boolean;
			permissionMode?: string;
		},
	];
	toolResult: [
		data: {
			toolCallId: string;
			output: unknown;
			error?: string | null;
			answers?: Record<string, string>;
		},
	];
	abort: [];
	regenerate: [];
	config: [config: SessionHostConfig];
	connected: [];
	disconnected: [data: { reason?: string }];
	error: [error: Error];
}

// ---------------------------------------------------------------------------
// SessionHost
// ---------------------------------------------------------------------------

export class SessionHost {
	private readonly sessionId: string;
	private readonly baseUrl: string;
	private readonly headers: Record<string, string>;
	private readonly externalSignal?: AbortSignal;

	private sessionDB: SessionDB | null = null;
	private readonly seenMessageIds = new Set<string>();
	private unsubscribe: (() => void) | null = null;
	private abortController: AbortController | null = null;
	private readonly emitter = new EventEmitter();

	config: SessionHostConfig = {};

	constructor(options: SessionHostOptions) {
		this.sessionId = options.sessionId;
		this.baseUrl = options.baseUrl;
		this.headers = options.headers ?? {};
		this.externalSignal = options.signal;
	}

	// -- Typed event methods --------------------------------------------------

	on<K extends keyof SessionHostEventMap>(
		event: K,
		listener: (...args: SessionHostEventMap[K]) => void,
	): this {
		this.emitter.on(event, listener as (...args: unknown[]) => void);
		return this;
	}

	off<K extends keyof SessionHostEventMap>(
		event: K,
		listener: (...args: SessionHostEventMap[K]) => void,
	): this {
		this.emitter.off(event, listener as (...args: unknown[]) => void);
		return this;
	}

	private emit<K extends keyof SessionHostEventMap>(
		event: K,
		...args: SessionHostEventMap[K]
	): boolean {
		return this.emitter.emit(event, ...args);
	}

	// -- Lifecycle ------------------------------------------------------------

	start(): void {
		this.abortController = new AbortController();

		if (this.externalSignal) {
			this.externalSignal.addEventListener(
				"abort",
				() => this.abortController?.abort(),
				{ once: true },
			);
		}

		this.sessionDB = createSessionDB({
			sessionId: this.sessionId,
			baseUrl: this.baseUrl,
			headers: this.headers,
			signal: this.abortController.signal,
		});

		// preload() starts the SSE consumer and waits for initial sync.
		// Without this call, no data flows to the collections and
		// subscribeChanges never fires.
		this.sessionDB
			.preload()
			.then(() => this.onPreloaded())
			.catch((err) => {
				if (this.abortController?.signal.aborted) return;
				console.error(
					`[SessionHost] Preload failed for ${this.sessionId}:`,
					err,
				);
				this.emit("error", err instanceof Error ? err : new Error(String(err)));
			});
	}

	/** Called after preload completes — seeds history, subscribes to live changes. */
	private onPreloaded(): void {
		if (!this.sessionDB) return; // stopped before preload finished

		const chunks = this.sessionDB.collections.chunks;

		// Seed seenMessageIds from existing chunks (prevents re-triggering history).
		// Also replay the latest config event.
		// Track user messages and the latest assistant timestamp for catch-up.
		let latestConfig: Record<string, unknown> | null = null;
		let lastAssistantTime = "";
		const userMessages: Array<{
			messageId: string;
			message: UIMessage;
			createdAt: string;
		}> = [];

		for (const row of chunks.values()) {
			const chunkRow = row as ChunkRow;
			try {
				const parsed = JSON.parse(chunkRow.chunk);
				if (
					parsed.type === "whole-message" &&
					parsed.message?.role === "user"
				) {
					this.seenMessageIds.add(chunkRow.messageId);
					userMessages.push({
						messageId: chunkRow.messageId,
						message: parsed.message as UIMessage,
						createdAt: chunkRow.createdAt,
					});
				}
				if (
					chunkRow.role === "assistant" &&
					chunkRow.createdAt > lastAssistantTime
				) {
					lastAssistantTime = chunkRow.createdAt;
				}
				if (parsed.type === "config") {
					latestConfig = parsed;
				}
			} catch {
				// skip unparseable
			}
		}

		if (latestConfig) {
			this.applyConfig(latestConfig);
		}

		// Subscribe to chunk changes (live updates via SSE)
		const subscription = chunks.subscribeChanges(
			(changes: Array<{ type: string; value: unknown }>) => {
				for (const change of changes) {
					if (change.type !== "insert" && change.type !== "update") continue;
					const row = change.value as ChunkRow;

					try {
						const parsed = JSON.parse(row.chunk);
						this.handleChunk(parsed, row);
					} catch {
						// skip unparseable
					}
				}
			},
		);

		this.unsubscribe = () => subscription.unsubscribe();
		this.emit("connected");

		// Catch-up: emit pending user messages that have no assistant response.
		// This handles the race where a message was written to the stream before
		// the SessionHost started (e.g. first message triggers session creation,
		// but the watcher only starts after Electric syncs the session_hosts row).
		const pending = userMessages.filter((m) => m.createdAt > lastAssistantTime);
		if (pending.length > 0) {
			pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
			const latest = pending.at(-1);
			if (latest) {
				console.log(
					`[SessionHost] Catch-up: emitting pending message ${latest.messageId}`,
				);
				this.emit("message", {
					messageId: latest.messageId,
					message: latest.message,
				});
			}
		}
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.abortController?.abort();
		this.abortController = null;
		if (this.sessionDB) {
			this.sessionDB.close();
			this.sessionDB = null;
		}
		this.emit("disconnected", { reason: "stopped" });
	}

	// -- Write methods --------------------------------------------------------

	async writeStream(
		messageId: string,
		stream: ReadableStream<UIMessageChunk>,
		options?: { signal?: AbortSignal },
	): Promise<void> {
		const streamUrl = `${this.baseUrl}/${this.sessionId}/stream`;
		const durableStream = new DurableStream({
			url: streamUrl,
			headers: this.headers,
			contentType: "application/json",
		});

		// Auth headers must be injected via custom fetch since
		// IdempotentProducer doesn't forward DurableStream.headers on POSTs.
		const authFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
			fetch(input, {
				...init,
				headers: { ...this.headers, ...init?.headers },
			})) as typeof fetch;

		const producer = new IdempotentProducer(
			durableStream,
			`agent-${this.sessionId}`,
			{
				autoClaim: true,
				lingerMs: 250,
				maxInFlight: 20,
				signal: options?.signal,
				fetch: authFetch,
				onError: (err) => {
					if (options?.signal?.aborted) return;
					this.emit("error", err);
				},
			},
		);

		let seq = 0;
		const reader = stream.getReader();

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done || options?.signal?.aborted) break;

				const event = sessionStateSchema.chunks.insert({
					key: `${messageId}:${seq}`,
					value: {
						messageId,
						actorId: "agent",
						role: "assistant",
						chunk: JSON.stringify(value),
						seq,
						createdAt: new Date().toISOString(),
					},
				});

				producer.append(JSON.stringify(event));
				seq++;
			}

			// Write abort chunk so clients see isComplete = true
			if (options?.signal?.aborted) {
				const abortEvent = sessionStateSchema.chunks.insert({
					key: `${messageId}:${seq}`,
					value: {
						messageId,
						actorId: "agent",
						role: "assistant",
						chunk: JSON.stringify({ type: "abort" }),
						seq,
						createdAt: new Date().toISOString(),
					},
				});
				producer.append(JSON.stringify(abortEvent));
				seq++;
			}
		} finally {
			try {
				await producer.flush();
				await producer.detach();
			} catch (err) {
				if (!options?.signal?.aborted) {
					this.emit(
						"error",
						err instanceof Error ? err : new Error(String(err)),
					);
				}
			}
		}
	}

	async postConfig(config: Partial<SessionHostConfig>): Promise<void> {
		const response = await fetch(
			`${this.baseUrl}/${this.sessionId}/stream/config`,
			{
				method: "POST",
				headers: {
					...this.headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(config),
			},
		);
		if (!response.ok) {
			throw new Error(`Failed to post config: ${response.status}`);
		}
	}

	async postTitle(title: string): Promise<void> {
		const response = await fetch(`${this.baseUrl}/${this.sessionId}`, {
			method: "PATCH",
			headers: {
				...this.headers,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ title }),
		});
		if (!response.ok) {
			throw new Error(`Failed to post title: ${response.status}`);
		}
	}

	// -- Internal -------------------------------------------------------------

	private handleChunk(parsed: Record<string, unknown>, row: ChunkRow): void {
		// User message → emit "message"
		if (
			parsed.type === "whole-message" &&
			typeof parsed.message === "object" &&
			parsed.message !== null
		) {
			const msg = parsed.message as Record<string, unknown>;
			if (msg.role !== "user") return;
			if (this.seenMessageIds.has(row.messageId)) return;
			this.seenMessageIds.add(row.messageId);

			this.emit("message", {
				messageId: row.messageId,
				message: parsed.message as UIMessage,
			});
		}

		// Tool result → emit "toolResult"
		if (parsed.type === "tool-result") {
			this.emit("toolResult", {
				toolCallId: parsed.toolCallId as string,
				output: parsed.output,
				error: typeof parsed.error === "string" ? parsed.error : null,
				answers:
					typeof parsed.answers === "object" && parsed.answers !== null
						? (parsed.answers as Record<string, string>)
						: undefined,
			});
		}

		// Tool approval → emit "toolApproval"
		if (
			parsed.type === "approval-response" ||
			parsed.type === "tool-approval"
		) {
			this.emit("toolApproval", {
				approvalId: parsed.approvalId as string,
				approved: parsed.approved === true,
				permissionMode:
					typeof parsed.permissionMode === "string"
						? parsed.permissionMode
						: undefined,
			});
		}

		// Control events
		if (parsed.type === "control") {
			if (parsed.action === "abort") {
				this.emit("abort");
			} else if (parsed.action === "regenerate") {
				this.emit("regenerate");
			}
		}

		// Config → merge and emit "config"
		if (parsed.type === "config") {
			this.applyConfig(parsed);
			this.emit("config", { ...this.config });
		}
	}

	private applyConfig(config: Record<string, unknown>): void {
		if (typeof config.model === "string") this.config.model = config.model;
		if (typeof config.cwd === "string") this.config.cwd = config.cwd;
		if (typeof config.permissionMode === "string")
			this.config.permissionMode = config.permissionMode;
		if (typeof config.thinkingEnabled === "boolean")
			this.config.thinkingEnabled = config.thinkingEnabled;
		if (Array.isArray(config.availableModels))
			this.config.availableModels = config.availableModels;
		if (Array.isArray(config.slashCommands))
			this.config.slashCommands = config.slashCommands;
	}
}
