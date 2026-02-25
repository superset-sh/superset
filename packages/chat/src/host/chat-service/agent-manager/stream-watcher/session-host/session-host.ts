import { EventEmitter } from "node:events";
import { DurableStream, IdempotentProducer } from "@durable-streams/client";
import type { UIMessage, UIMessageChunk } from "ai";
import { type ChunkRow, sessionStateSchema } from "../../../../../schema";
import { createSessionDB, type SessionDB } from "../../../../../session-db";
import {
	extractTextContent,
	materializeMessage,
} from "../../../../../session-db/collections/messages";
import type { GetHeaders } from "../../../../lib/auth/auth";
import { sessionRunIds } from "../../session-state";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionHostOptions {
	sessionId: string;
	/** Proxy base URL (e.g. "https://api.example.com/api/chat"). All reads and writes go through the proxy. */
	baseUrl: string;
	getHeaders: GetHeaders;
	signal?: AbortSignal;
}

export interface MessageMetadata {
	model?: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
}

export interface SessionHostEventMap {
	message: [
		data: { messageId: string; message: UIMessage; metadata?: MessageMetadata },
	];
	toolApprovalRequest: [];
	toolApproval: [
		data: {
			approvalId: string;
			approved: boolean;
			toolCallId?: string;
			permissionMode?: string;
		},
	];
	toolOutput: [
		data: {
			toolCallId: string;
			tool: string;
			state: "output-available" | "output-error";
			output: unknown;
			errorText?: string;
		},
	];
	abort: [];
	regenerate: [];
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
	private readonly getHeaders: GetHeaders;
	private readonly externalSignal?: AbortSignal;
	private readonly fetchWithAuth: (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => Promise<Response>;

	private sessionDB: SessionDB | null = null;
	private readonly seenMessageIds = new Set<string>();
	private unsubscribe: (() => void) | null = null;
	private abortController: AbortController | null = null;
	private readonly emitter = new EventEmitter();

	constructor(options: SessionHostOptions) {
		this.sessionId = options.sessionId;
		this.baseUrl = options.baseUrl;
		this.getHeaders = options.getHeaders;
		this.externalSignal = options.signal;
		this.fetchWithAuth = async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			const authHeaders = await this.getHeaders();
			const headers = new Headers(init?.headers);
			for (const [key, value] of Object.entries(authHeaders)) {
				headers.set(key, value);
			}
			return fetch(input, {
				...init,
				headers,
			});
		};
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
			fetch: this.fetchWithAuth as typeof fetch,
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
		// Track user messages and the latest assistant timestamp for catch-up.
		let lastAssistantTime = "";
		let latestRunId: string | null = null;
		let latestRunIdTime = "";
		let latestToolApprovalRequestTime = "";
		let latestToolApprovalResponseTime = "";
		const userMessages: Array<{
			messageId: string;
			message: UIMessage;
			metadata?: MessageMetadata;
			createdAt: string;
		}> = [];
		const pendingSignals: Array<{
			parsed: Record<string, unknown>;
			row: ChunkRow;
		}> = [];

		for (const row of chunks.values()) {
			const chunkRow = row as ChunkRow;
			try {
				const parsed = JSON.parse(chunkRow.chunk);
				const runId = this.extractRunId(parsed as Record<string, unknown>);
				if (
					runId &&
					(latestRunId === null || chunkRow.createdAt >= latestRunIdTime)
				) {
					latestRunId = runId;
					latestRunIdTime = chunkRow.createdAt;
				}
				if (
					parsed.type === "whole-message" &&
					parsed.message?.role === "user"
				) {
					this.seenMessageIds.add(chunkRow.messageId);
					userMessages.push({
						messageId: chunkRow.messageId,
						message: parsed.message as UIMessage,
						metadata: parsed.metadata as MessageMetadata | undefined,
						createdAt: chunkRow.createdAt,
					});
				}
				if (
					chunkRow.role === "assistant" &&
					chunkRow.createdAt > lastAssistantTime
				) {
					lastAssistantTime = chunkRow.createdAt;
				}
				if (
					parsed.type === "tool-approval-request" &&
					chunkRow.createdAt > latestToolApprovalRequestTime
				) {
					latestToolApprovalRequestTime = chunkRow.createdAt;
				}
				if (
					(parsed.type === "approval-response" ||
						parsed.type === "tool-approval") &&
					chunkRow.createdAt > latestToolApprovalResponseTime
				) {
					latestToolApprovalResponseTime = chunkRow.createdAt;
				}
				if (
					parsed.type === "tool-output" ||
					parsed.type === "approval-response" ||
					parsed.type === "tool-approval"
				) {
					pendingSignals.push({
						parsed: parsed as Record<string, unknown>,
						row: chunkRow,
					});
				}
			} catch {
				// skip unparseable
			}
		}
		if (latestRunId) {
			sessionRunIds.set(this.sessionId, latestRunId);
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
					metadata: latest.metadata,
				});
			}
		}

		if (
			latestToolApprovalRequestTime &&
			latestToolApprovalRequestTime > latestToolApprovalResponseTime
		) {
			this.emit("toolApprovalRequest");
		}

		const pendingToolSignals = pendingSignals
			.filter(({ row }) => row.createdAt > lastAssistantTime)
			.sort((a, b) => a.row.createdAt.localeCompare(b.row.createdAt));
		for (const pendingSignal of pendingToolSignals) {
			this.handleChunk(pendingSignal.parsed, pendingSignal.row);
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
			contentType: "application/json",
			fetch: this.fetchWithAuth as typeof fetch,
		});

		let producerError: Error | null = null;
		const producer = new IdempotentProducer(
			durableStream,
			`agent-${this.sessionId}-${messageId}`,
			{
				autoClaim: true,
				lingerMs: 250,
				maxInFlight: 20,
				signal: options?.signal,
				fetch: this.fetchWithAuth as typeof fetch,
				onError: (err) => {
					if (options?.signal?.aborted) return;
					producerError = err;
					this.emit("error", err);
				},
			},
		);

		let seq = 0;
		const reader = stream.getReader();
		let writeError: Error | null = null;

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

			// Some provider/tool-approval edge-cases can yield an empty stream.
			// Emit a terminal assistant error chunk so the UI doesn't appear stuck.
			if (!options?.signal?.aborted && seq === 0) {
				const emptyEvent = sessionStateSchema.chunks.insert({
					key: `${messageId}:${seq}`,
					value: {
						messageId,
						actorId: "agent",
						role: "assistant",
						chunk: JSON.stringify({
							type: "error",
							errorText: "Agent returned no response",
						}),
						seq,
						createdAt: new Date().toISOString(),
					},
				});
				producer.append(JSON.stringify(emptyEvent));
				seq++;

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

			if (producerError) {
				throw producerError;
			}
		} catch (err) {
			writeError = err instanceof Error ? err : new Error(String(err));
		} finally {
			try {
				await producer.flush();
				await producer.detach();
			} catch (err) {
				if (!options?.signal?.aborted) {
					const producerCleanupError =
						err instanceof Error ? err : new Error(String(err));
					this.emit("error", producerCleanupError);
					if (!writeError) {
						writeError = producerCleanupError;
					}
				}
			}
		}

		if (writeError && !options?.signal?.aborted) {
			throw writeError;
		}
	}

	getLatestRunId(): string | null {
		if (!this.sessionDB) return null;

		let latestRunId: string | null = null;
		let latestCreatedAt = "";

		for (const row of this.sessionDB.collections.chunks.values()) {
			const chunkRow = row as ChunkRow;
			try {
				const parsed = JSON.parse(chunkRow.chunk) as Record<string, unknown>;
				const runId = this.extractRunId(parsed);
				if (!runId) continue;
				if (latestRunId === null || chunkRow.createdAt >= latestCreatedAt) {
					latestRunId = runId;
					latestCreatedAt = chunkRow.createdAt;
				}
			} catch {
				// skip unparseable
			}
		}

		return latestRunId;
	}

	getMessageDigest(limit = 20): { role: string; text: string }[] {
		if (!this.sessionDB) return [];

		const chunks = this.sessionDB.collections.chunks;
		const grouped = new Map<string, ChunkRow[]>();
		for (const row of chunks.values()) {
			const r = row as ChunkRow;
			const arr = grouped.get(r.messageId);
			if (arr) arr.push(r);
			else grouped.set(r.messageId, [r]);
		}

		const messages: { role: string; text: string; createdAt: Date }[] = [];
		for (const rows of grouped.values()) {
			try {
				const msg = materializeMessage(rows);
				const text = extractTextContent(msg).slice(0, 500);
				messages.push({ role: msg.role, text, createdAt: msg.createdAt });
			} catch {
				// skip unmaterializable
			}
		}

		messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
		return messages.slice(-limit).map(({ role, text }) => ({ role, text }));
	}

	async postTitle(title: string): Promise<void> {
		const response = await this.fetchWithAuth(
			`${this.baseUrl}/${this.sessionId}`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ title }),
			},
		);
		if (!response.ok) {
			throw new Error(`Failed to post title: ${response.status}`);
		}
	}

	// -- Internal -------------------------------------------------------------

	private handleChunk(parsed: Record<string, unknown>, row: ChunkRow): void {
		const runId = this.extractRunId(parsed);
		if (runId) {
			sessionRunIds.set(this.sessionId, runId);
		}

		// User message -> emit "message" with per-message metadata
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
				metadata: parsed.metadata as MessageMetadata | undefined,
			});
		}

		// Tool output -> emit "toolOutput"
		if (parsed.type === "tool-output") {
			if (
				typeof parsed.toolCallId !== "string" ||
				typeof parsed.tool !== "string"
			) {
				return;
			}
			this.emit("toolOutput", {
				toolCallId: parsed.toolCallId,
				tool: parsed.tool,
				state:
					parsed.state === "output-error" ? "output-error" : "output-available",
				output: parsed.output,
				errorText:
					typeof parsed.errorText === "string" ? parsed.errorText : undefined,
			});
		}

		if (parsed.type === "tool-approval-request") {
			this.emit("toolApprovalRequest");
		}

		// Tool approval -> emit "toolApproval"
		if (
			parsed.type === "approval-response" ||
			parsed.type === "tool-approval"
		) {
			this.emit("toolApproval", {
				approvalId: parsed.approvalId as string,
				approved: parsed.approved === true,
				toolCallId:
					typeof parsed.toolCallId === "string" ? parsed.toolCallId : undefined,
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
	}

	private extractRunId(parsed: Record<string, unknown>): string | null {
		const candidates = [
			parsed.runId,
			parsed.run_id,
			typeof parsed.metadata === "object" && parsed.metadata !== null
				? (parsed.metadata as Record<string, unknown>).runId
				: undefined,
			typeof parsed.metadata === "object" && parsed.metadata !== null
				? (parsed.metadata as Record<string, unknown>).run_id
				: undefined,
			typeof parsed.message === "object" && parsed.message !== null
				? (parsed.message as Record<string, unknown>).runId
				: undefined,
			typeof parsed.message === "object" && parsed.message !== null
				? (parsed.message as Record<string, unknown>).run_id
				: undefined,
		];

		for (const candidate of candidates) {
			if (typeof candidate === "string" && candidate.trim().length > 0) {
				return candidate;
			}
		}

		return null;
	}
}
