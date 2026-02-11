import { ChunkBatcher } from "./chunk-batcher";
import { GenerationWatchdog } from "./generation-watchdog";
import {
	buildProxyHeaders,
	ProxyRequestError,
	postJsonWithRetry,
} from "./proxy-requests";
import type { ActiveSession, EnsureSessionReadyInput } from "./session-types";

const FIRST_CHUNK_TIMEOUT_MS = 30_000;
const CHUNK_INACTIVITY_TIMEOUT_MS = 45_000;
const TERMINAL_CHUNK_MAX_ATTEMPTS = 3;
const FINISH_MAX_ATTEMPTS = 3;

interface AgentStreamWriterDeps {
	proxyUrl: string;
	emitSessionError: (params: { sessionId: string; error: string }) => void;
	ensureSessionReady: (input: EnsureSessionReadyInput) => Promise<void>;
	isSessionActive: (sessionId: string) => boolean;
}

export interface PrepareStreamResult {
	headers: Record<string, string>;
	batcher: ChunkBatcher;
	watchdog: GenerationWatchdog;
}

interface PrepareStreamInput {
	sessionId: string;
	session: ActiveSession;
	abortController: AbortController;
}

interface DrainInput {
	sessionId: string;
	batcher: ChunkBatcher | null;
	abortController: AbortController;
}

interface FinalizeInput {
	sessionId: string;
	session: ActiveSession;
	messageId: string;
	headers: Record<string, string> | null;
}

export class AgentStreamWriter {
	constructor(private readonly deps: AgentStreamWriterDeps) {}

	private createWatchdog({
		sessionId,
		abortController,
	}: {
		sessionId: string;
		abortController: AbortController;
	}): GenerationWatchdog {
		return new GenerationWatchdog(({ reason }) => {
			if (abortController.signal.aborted) return;
			console.error(`[chat/session] ${reason}`);
			this.deps.emitSessionError({ sessionId, error: reason });
			abortController.abort();
		});
	}

	private isSessionNotFoundError(error: unknown): boolean {
		if (error instanceof ProxyRequestError) {
			if (error.status !== 404) {
				return false;
			}
			if (!error.code) {
				return true;
			}
			const normalizedCode = error.code.toLowerCase();
			return (
				normalizedCode === "session_not_found" ||
				normalizedCode === "session not found"
			);
		}

		const message = error instanceof Error ? error.message : String(error);
		const normalized = message.toLowerCase();
		return (
			normalized.includes("status 404") &&
			(normalized.includes("session_not_found") ||
				normalized.includes("session not found"))
		);
	}

	private async recoverRemoteSession({
		sessionId,
		session,
	}: {
		sessionId: string;
		session: ActiveSession;
	}): Promise<void> {
		if (!this.deps.isSessionActive(sessionId)) {
			throw new Error(
				`[chat/session] Session ${sessionId} is no longer active; refusing recovery`,
			);
		}

		console.warn(
			`[chat/session] Remote session missing for ${sessionId}; recreating`,
		);
		await this.deps.ensureSessionReady({
			sessionId,
			cwd: session.cwd,
			model: session.model,
			permissionMode: session.permissionMode,
			maxThinkingTokens: session.maxThinkingTokens,
		});
	}

	private async postWithSessionRecovery({
		sessionId,
		session,
		url,
		headers,
		body,
		maxAttempts,
		operation,
		signal,
	}: {
		sessionId: string;
		session: ActiveSession;
		url: string;
		headers: Record<string, string>;
		body: unknown;
		maxAttempts: number;
		operation: string;
		signal?: AbortSignal;
	}): Promise<void> {
		try {
			await postJsonWithRetry({
				url,
				headers,
				body,
				maxAttempts,
				operation,
				signal,
			});
		} catch (error) {
			if (!this.isSessionNotFoundError(error)) {
				throw error;
			}
			if (signal?.aborted) {
				throw error;
			}

			await this.recoverRemoteSession({ sessionId, session });
			const refreshedHeaders = await buildProxyHeaders();
			await postJsonWithRetry({
				url,
				headers: refreshedHeaders,
				body,
				maxAttempts,
				operation: `${operation} (after session restore)`,
				signal,
			});
		}
	}

	private createChunkBatcher({
		sessionId,
		session,
		proxyHeaders,
		abortController,
	}: {
		sessionId: string;
		session: ActiveSession;
		proxyHeaders: Record<string, string>;
		abortController: AbortController;
	}): ChunkBatcher {
		return new ChunkBatcher({
			sendBatch: async (chunks) => {
				await this.postWithSessionRecovery({
					sessionId,
					session,
					url: `${this.deps.proxyUrl}/v1/sessions/${sessionId}/chunks/batch`,
					headers: proxyHeaders,
					body: { chunks },
					maxAttempts: 1,
					operation: "write chunk batch",
					signal: abortController.signal,
				});
			},
			onFatalError: (error) => {
				if (abortController.signal.aborted) return;
				const detail = error instanceof Error ? error.message : String(error);
				console.error(
					`[chat/session] Chunk persistence failed for ${sessionId}:`,
					detail,
				);
				this.deps.emitSessionError({
					sessionId,
					error: `Chunk persistence failed: ${detail}`,
				});
				abortController.abort();
			},
		});
	}

	async prepareStream({
		sessionId,
		session,
		abortController,
	}: PrepareStreamInput): Promise<PrepareStreamResult> {
		await this.deps.ensureSessionReady({
			sessionId,
			cwd: session.cwd,
			model: session.model,
			permissionMode: session.permissionMode,
			maxThinkingTokens: session.maxThinkingTokens,
		});
		const headers = await buildProxyHeaders();
		const batcher = this.createChunkBatcher({
			sessionId,
			session,
			proxyHeaders: headers,
			abortController,
		});
		const watchdog = this.createWatchdog({ sessionId, abortController });
		watchdog.arm({
			timeoutMs: FIRST_CHUNK_TIMEOUT_MS,
			reason: `No assistant response within ${FIRST_CHUNK_TIMEOUT_MS}ms`,
		});

		return { headers, batcher, watchdog };
	}

	onAssistantChunk({
		watchdog,
		batcher,
		messageId,
		chunk,
	}: {
		watchdog: GenerationWatchdog;
		batcher: ChunkBatcher;
		messageId: string;
		chunk: unknown;
	}): void {
		watchdog.arm({
			timeoutMs: CHUNK_INACTIVITY_TIMEOUT_MS,
			reason: `Assistant stream stalled for ${CHUNK_INACTIVITY_TIMEOUT_MS}ms`,
		});
		batcher.push({
			messageId,
			actorId: "claude",
			role: "assistant",
			chunk,
		});
	}

	async drainChunkBatcher({
		sessionId,
		batcher,
		abortController,
	}: DrainInput): Promise<void> {
		if (!batcher) return;

		try {
			await batcher.drain();
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			const isAbortError =
				err instanceof DOMException && err.name === "AbortError";
			if (isAbortError && abortController.signal.aborted) {
				console.debug(`[chat/session] Chunk drain aborted for ${sessionId}`);
				return;
			}
			console.error(
				`[chat/session] Failed to drain chunk batcher for ${sessionId}:`,
				detail,
			);
			this.deps.emitSessionError({
				sessionId,
				error: `Chunk drain failed: ${detail}`,
			});
		}
	}

	private async persistTerminalChunk({
		sessionId,
		session,
		messageId,
		headers,
	}: {
		sessionId: string;
		session: ActiveSession;
		messageId: string;
		headers: Record<string, string>;
	}): Promise<boolean> {
		const terminalChunkPayload = {
			messageId,
			actorId: "claude",
			role: "assistant",
			chunk: { type: "message-end" as const },
		};

		try {
			await this.postWithSessionRecovery({
				sessionId,
				session,
				url: `${this.deps.proxyUrl}/v1/sessions/${sessionId}/chunks`,
				headers,
				body: terminalChunkPayload,
				maxAttempts: TERMINAL_CHUNK_MAX_ATTEMPTS,
				operation: "write terminal chunk",
			});
			return true;
		} catch (err) {
			console.error(
				`[chat/session] Failed to write terminal chunk for ${sessionId}:`,
				err,
			);
		}

		try {
			await this.postWithSessionRecovery({
				sessionId,
				session,
				url: `${this.deps.proxyUrl}/v1/sessions/${sessionId}/chunks/batch`,
				headers,
				body: { chunks: [terminalChunkPayload] },
				maxAttempts: TERMINAL_CHUNK_MAX_ATTEMPTS,
				operation: "write terminal chunk (batch fallback)",
			});
			return true;
		} catch (err) {
			console.error(
				`[chat/session] Failed to write terminal chunk fallback for ${sessionId}:`,
				err,
			);
		}

		return false;
	}

	private async finishGeneration({
		sessionId,
		session,
		messageId,
		headers,
	}: {
		sessionId: string;
		session: ActiveSession;
		messageId: string;
		headers: Record<string, string>;
	}): Promise<void> {
		try {
			await this.postWithSessionRecovery({
				sessionId,
				session,
				url: `${this.deps.proxyUrl}/v1/sessions/${sessionId}/generations/finish`,
				headers,
				body: { messageId },
				maxAttempts: FINISH_MAX_ATTEMPTS,
				operation: "finish generation",
			});
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			console.error(
				`[chat/session] POST /generations/finish failed for ${sessionId}:`,
				detail,
			);
			this.deps.emitSessionError({
				sessionId,
				error: `Generation finish failed: ${detail}`,
			});
		}
	}

	async finalizeGeneration({
		sessionId,
		session,
		messageId,
		headers,
	}: FinalizeInput): Promise<void> {
		if (!headers) return;

		const terminalChunkPersisted = await this.persistTerminalChunk({
			sessionId,
			session,
			messageId,
			headers,
		});
		if (!terminalChunkPersisted) {
			this.deps.emitSessionError({
				sessionId,
				error:
					"Assistant completion marker failed to persist. Message may stay loading.",
			});
		}

		await this.finishGeneration({ sessionId, session, messageId, headers });
	}
}
