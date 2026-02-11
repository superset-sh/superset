import { EventEmitter } from "node:events";
import { join } from "node:path";
import {
	createPermissionRequest,
	executeAgent,
	getClaudeSessionId,
	type PermissionRequestParams,
	resolvePendingPermission,
} from "@superset/agent";
import { app } from "electron";
import { env } from "main/env.main";
import { buildClaudeEnv } from "../auth";
import type { SessionStore } from "../session-store";
import { ChunkBatcher } from "./chunk-batcher";
import { GenerationWatchdog } from "./generation-watchdog";
import { buildProxyHeaders, postJsonWithRetry } from "./proxy-requests";
import type {
	ErrorEvent,
	PermissionRequestEvent,
	SessionEndEvent,
	SessionStartEvent,
} from "./session-events";

const PROXY_URL = env.STREAMS_URL;
const FIRST_CHUNK_TIMEOUT_MS = 30_000;
const CHUNK_INACTIVITY_TIMEOUT_MS = 45_000;
const TERMINAL_CHUNK_MAX_ATTEMPTS = 3;
const FINISH_MAX_ATTEMPTS = 3;

function getClaudeBinaryPath(): string {
	if (app.isPackaged) {
		return join(process.resourcesPath, "bin", "claude");
	}
	const platform = process.platform;
	const arch = process.arch;
	return join(
		app.getAppPath(),
		"resources",
		"bin",
		`${platform}-${arch}`,
		"claude",
	);
}

interface ActiveSession {
	sessionId: string;
	cwd: string;
	model?: string;
	permissionMode?: string;
	maxThinkingTokens?: number;
}

export class ChatSessionManager extends EventEmitter {
	private sessions = new Map<string, ActiveSession>();
	private runningAgents = new Map<string, AbortController>();

	constructor(private readonly store: SessionStore) {
		super();
	}

	private async ensureSessionReady({
		sessionId,
		cwd,
		model,
		permissionMode,
		maxThinkingTokens,
	}: {
		sessionId: string;
		cwd: string;
		model?: string;
		permissionMode?: string;
		maxThinkingTokens?: number;
	}): Promise<void> {
		const headers = await buildProxyHeaders();

		const createRes = await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, {
			method: "PUT",
			headers,
		});
		if (!createRes.ok) {
			throw new Error(
				`PUT /v1/sessions/${sessionId} failed: ${createRes.status}`,
			);
		}

		this.sessions.set(sessionId, {
			sessionId,
			cwd,
			model,
			permissionMode,
			maxThinkingTokens,
		});
	}

	private emitSessionError({
		sessionId,
		error,
	}: {
		sessionId: string;
		error: string;
	}): void {
		this.emit("event", {
			type: "error",
			sessionId,
			error,
		} satisfies ErrorEvent);
	}

	private abortExistingAgent({ sessionId }: { sessionId: string }): void {
		const existingController = this.runningAgents.get(sessionId);
		if (!existingController) return;
		console.warn(`[chat/session] Aborting previous agent run for ${sessionId}`);
		existingController.abort();
	}

	private abortRunningAgent({ sessionId }: { sessionId: string }): void {
		const controller = this.runningAgents.get(sessionId);
		if (!controller) return;
		controller.abort();
		this.runningAgents.delete(sessionId);
	}

	private emitSessionEnd({ sessionId }: { sessionId: string }): void {
		this.emit("event", {
			type: "session_end",
			sessionId,
			exitCode: null,
		} satisfies SessionEndEvent);
	}

	private async stopRemoteSession({
		sessionId,
		headers,
		logContext,
		logLevel,
	}: {
		sessionId: string;
		headers: Record<string, string>;
		logContext: string;
		logLevel: "error" | "debug";
	}): Promise<void> {
		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers,
				body: JSON.stringify({}),
			});
		} catch (error) {
			if (logLevel === "error") {
				console.error(`[chat/session] ${logContext}:`, error);
			} else {
				console.debug(`[chat/session] ${logContext}:`, error);
			}
		}
	}

	private async updateDeactivatedSessionMeta({
		sessionId,
	}: {
		sessionId: string;
	}): Promise<void> {
		const claudeSessionId = getClaudeSessionId(sessionId);
		if (claudeSessionId) {
			await this.store.update(sessionId, {
				providerSessionId: claudeSessionId,
				lastActiveAt: Date.now(),
			});
			return;
		}
		await this.store.update(sessionId, {
			lastActiveAt: Date.now(),
		});
	}

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
			this.emitSessionError({ sessionId, error: reason });
			abortController.abort();
		});
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
					url: `${PROXY_URL}/v1/sessions/${sessionId}/chunks/batch`,
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
				this.emitSessionError({
					sessionId,
					error: `Chunk persistence failed: ${detail}`,
				});
				abortController.abort();
			},
		});
	}

	private isSessionNotFoundError(error: unknown): boolean {
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
		console.warn(
			`[chat/session] Remote session missing for ${sessionId}; recreating`,
		);
		await this.ensureSessionReady({
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

	private async executeAgentRun({
		session,
		sessionId,
		prompt,
		messageId,
		abortController,
		watchdog,
		batcher,
	}: {
		session: ActiveSession;
		sessionId: string;
		prompt: string;
		messageId: string;
		abortController: AbortController;
		watchdog: GenerationWatchdog;
		batcher: ChunkBatcher;
	}): Promise<void> {
		const agentEnv = buildClaudeEnv();

		await executeAgent({
			sessionId,
			prompt,
			cwd: session.cwd,
			pathToClaudeCodeExecutable: getClaudeBinaryPath(),
			env: agentEnv,
			model: session.model,
			permissionMode:
				(session.permissionMode as
					| "default"
					| "acceptEdits"
					| "bypassPermissions"
					| undefined) ?? "bypassPermissions",
			maxThinkingTokens: session.maxThinkingTokens,
			signal: abortController.signal,
			onChunk: (chunk) => {
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
			},
			onPermissionRequest: async (params: PermissionRequestParams) => {
				this.emit("event", {
					type: "permission_request",
					sessionId,
					toolUseId: params.toolUseId,
					toolName: params.toolName,
					input: params.input,
				} satisfies PermissionRequestEvent);

				return createPermissionRequest({
					toolUseId: params.toolUseId,
					signal: params.signal,
				});
			},
			onEvent: (event) => {
				if (event.type === "session_initialized") {
					this.store
						.update(sessionId, {
							providerSessionId: event.claudeSessionId,
							lastActiveAt: Date.now(),
						})
						.catch((err: unknown) => {
							console.error(
								`[chat/session] Failed to update providerSessionId:`,
								err,
							);
						});
				}
			},
		});
	}

	private async drainChunkBatcher({
		sessionId,
		batcher,
		abortController,
	}: {
		sessionId: string;
		batcher: ChunkBatcher | null;
		abortController: AbortController;
	}): Promise<void> {
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
			this.emitSessionError({
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
				url: `${PROXY_URL}/v1/sessions/${sessionId}/chunks`,
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
				url: `${PROXY_URL}/v1/sessions/${sessionId}/chunks/batch`,
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
				url: `${PROXY_URL}/v1/sessions/${sessionId}/generations/finish`,
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
			this.emitSessionError({
				sessionId,
				error: `Generation finish failed: ${detail}`,
			});
		}
	}

	private async finalizeGeneration({
		sessionId,
		session,
		messageId,
		headers,
	}: {
		sessionId: string;
		session: ActiveSession;
		messageId: string;
		headers: Record<string, string> | null;
	}): Promise<void> {
		if (!headers) return;

		const terminalChunkPersisted = await this.persistTerminalChunk({
			sessionId,
			session,
			messageId,
			headers,
		});
		if (!terminalChunkPersisted) {
			this.emitSessionError({
				sessionId,
				error:
					"Assistant completion marker failed to persist. Message may stay loading.",
			});
		}

		await this.finishGeneration({ sessionId, session, messageId, headers });
	}

	async startSession({
		sessionId,
		workspaceId,
		cwd,
		paneId: _paneId,
		tabId: _tabId,
		model,
		permissionMode,
	}: {
		sessionId: string;
		workspaceId: string;
		cwd: string;
		paneId?: string;
		tabId?: string;
		model?: string;
		permissionMode?: string;
	}): Promise<void> {
		if (this.sessions.has(sessionId)) {
			console.warn(`[chat/session] Session ${sessionId} already active`);
			return;
		}

		console.log(`[chat/session] Starting session ${sessionId} in ${cwd}`);

		try {
			await this.ensureSessionReady({
				sessionId,
				cwd,
				model,
				permissionMode,
			});

			await this.store.create({
				sessionId,
				workspaceId,
				provider: "claude-sdk",
				title: "New chat",
				cwd,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});

			this.emit("event", {
				type: "session_start",
				sessionId,
			} satisfies SessionStartEvent);

			console.log(`[chat/session] Session ${sessionId} started`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[chat/session] Failed to start session:`, message);
			this.emitSessionError({ sessionId, error: message });
		}
	}

	async restoreSession({
		sessionId,
		cwd,
		paneId: _paneId,
		tabId: _tabId,
		model,
		permissionMode,
	}: {
		sessionId: string;
		cwd: string;
		paneId?: string;
		tabId?: string;
		model?: string;
		permissionMode?: string;
	}): Promise<void> {
		if (this.sessions.has(sessionId)) {
			return;
		}

		console.log(`[chat/session] Restoring session ${sessionId}`);

		try {
			await this.ensureSessionReady({
				sessionId,
				cwd,
				model,
				permissionMode,
			});

			await this.store.update(sessionId, {
				lastActiveAt: Date.now(),
			});

			this.emit("event", {
				type: "session_start",
				sessionId,
			} satisfies SessionStartEvent);

			console.log(`[chat/session] Session ${sessionId} restored`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[chat/session] Failed to restore session:`, message);
			this.emitSessionError({ sessionId, error: message });
		}
	}

	async startAgent({
		sessionId,
		prompt,
	}: {
		sessionId: string;
		prompt: string;
	}): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			console.error(
				`[chat/session] Session ${sessionId} not found for startAgent`,
			);
			this.emitSessionError({
				sessionId,
				error: "Session not active",
			});
			return;
		}

		this.abortExistingAgent({ sessionId });

		const abortController = new AbortController();
		this.runningAgents.set(sessionId, abortController);

		const messageId = crypto.randomUUID();
		const watchdog = this.createWatchdog({ sessionId, abortController });
		let headers: Record<string, string> | null = null;
		let batcher: ChunkBatcher | null = null;

		try {
			// Streams process can restart independently; make sure remote session exists.
			await this.ensureSessionReady({
				sessionId,
				cwd: session.cwd,
				model: session.model,
				permissionMode: session.permissionMode,
				maxThinkingTokens: session.maxThinkingTokens,
			});
			headers = await buildProxyHeaders();
			batcher = this.createChunkBatcher({
				sessionId,
				session,
				proxyHeaders: headers,
				abortController,
			});

			watchdog.arm({
				timeoutMs: FIRST_CHUNK_TIMEOUT_MS,
				reason: `No assistant response within ${FIRST_CHUNK_TIMEOUT_MS}ms`,
			});

			await this.executeAgentRun({
				session,
				sessionId,
				prompt,
				messageId,
				abortController,
				watchdog,
				batcher,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!abortController.signal.aborted) {
				console.error(
					`[chat/session] Agent execution failed for ${sessionId}:`,
					message,
				);
				this.emitSessionError({ sessionId, error: message });
			} else if (watchdog.wasTriggered) {
				console.warn(
					`[chat/session] Agent aborted by watchdog for ${sessionId}:`,
					message,
				);
			}
		} finally {
			watchdog.clear();
			await this.drainChunkBatcher({ sessionId, batcher, abortController });
			await this.finalizeGeneration({
				sessionId,
				session,
				messageId,
				headers,
			});

			this.runningAgents.delete(sessionId);
		}
	}

	resolvePermission({
		sessionId: _sessionId,
		toolUseId,
		approved,
		updatedInput,
	}: {
		sessionId: string;
		toolUseId: string;
		approved: boolean;
		updatedInput?: Record<string, unknown>;
	}): void {
		const result = approved
			? {
					behavior: "allow" as const,
					updatedInput: updatedInput ?? {},
				}
			: { behavior: "deny" as const, message: "User denied permission" };

		const resolved = resolvePendingPermission({ toolUseId, result });
		if (!resolved) {
			console.warn(
				`[chat/session] No pending permission for toolUseId=${toolUseId}`,
			);
		}
	}

	async interrupt({ sessionId }: { sessionId: string }): Promise<void> {
		if (!this.sessions.has(sessionId)) {
			console.warn(
				`[chat/session] Session ${sessionId} not found for interrupt`,
			);
			return;
		}

		console.log(`[chat/session] Interrupting session ${sessionId}`);
		this.abortRunningAgent({ sessionId });
		await this.stopRemoteSession({
			sessionId,
			headers: await buildProxyHeaders(),
			logContext: "Interrupt proxy stop failed",
			logLevel: "error",
		});
	}

	async deactivateSession({ sessionId }: { sessionId: string }): Promise<void> {
		if (!this.sessions.has(sessionId)) {
			return;
		}

		console.log(`[chat/session] Deactivating session ${sessionId}`);
		this.abortRunningAgent({ sessionId });
		await this.stopRemoteSession({
			sessionId,
			headers: await buildProxyHeaders(),
			logContext: "Stop during deactivate failed",
			logLevel: "debug",
		});

		try {
			await this.updateDeactivatedSessionMeta({ sessionId });
		} catch (err) {
			console.debug(
				`[chat/session] Store update during deactivate failed:`,
				err,
			);
		}

		this.sessions.delete(sessionId);
		this.emitSessionEnd({ sessionId });
	}

	async deleteSession({ sessionId }: { sessionId: string }): Promise<void> {
		console.log(`[chat/session] Deleting session ${sessionId}`);
		const headers = await buildProxyHeaders();
		this.abortRunningAgent({ sessionId });
		await this.stopRemoteSession({
			sessionId,
			headers,
			logContext: "Stop during delete failed",
			logLevel: "debug",
		});

		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, {
				method: "DELETE",
				headers,
			});
		} catch (err) {
			console.debug(`[chat/session] DELETE request failed:`, err);
		}

		await this.store.archive(sessionId);

		this.sessions.delete(sessionId);
		this.emitSessionEnd({ sessionId });
	}

	async updateSessionMeta(
		sessionId: string,
		patch: {
			title?: string;
			messagePreview?: string;
			providerSessionId?: string;
		},
	): Promise<void> {
		await this.store.update(sessionId, patch);
	}

	async updateAgentConfig({
		sessionId,
		maxThinkingTokens,
		model,
		permissionMode,
	}: {
		sessionId: string;
		maxThinkingTokens?: number | null;
		model?: string | null;
		permissionMode?: string | null;
	}): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			console.warn(
				`[chat/session] Session ${sessionId} not found for config update`,
			);
			return;
		}

		if (maxThinkingTokens !== undefined) {
			session.maxThinkingTokens =
				maxThinkingTokens === null ? undefined : maxThinkingTokens;
		}
		if (model !== undefined) {
			session.model = model === null ? undefined : model;
		}
		if (permissionMode !== undefined) {
			session.permissionMode =
				permissionMode === null ? undefined : permissionMode;
		}

		console.log(
			`[chat/session] Updated agent config for ${sessionId}`,
			[
				maxThinkingTokens !== undefined &&
					`maxThinkingTokens=${maxThinkingTokens}`,
				model !== undefined && `model=${model}`,
				permissionMode !== undefined && `permissionMode=${permissionMode}`,
			]
				.filter(Boolean)
				.join(", "),
		);
	}

	isSessionActive(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	getActiveSessions(): string[] {
		return Array.from(this.sessions.keys());
	}
}
