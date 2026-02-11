import { join } from "node:path";
import {
	createPermissionRequest,
	executeAgent,
	type PermissionRequestParams,
	resolvePendingPermission,
} from "@superset/agent";
import { app } from "electron";
import { buildClaudeEnv } from "../auth";
import type { SessionStore } from "../session-store";
import { ChunkBatcher } from "./chunk-batcher";
import { GenerationWatchdog } from "./generation-watchdog";
import { buildProxyHeaders, postJsonWithRetry } from "./proxy-requests";
import type { PermissionRequestEvent } from "./session-events";
import type { ActiveSession, EnsureSessionReadyInput } from "./session-types";

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

export interface StartAgentInput {
	sessionId: string;
	prompt: string;
}

export interface ResolvePermissionInput {
	sessionId: string;
	toolUseId: string;
	approved: boolean;
	updatedInput?: Record<string, unknown>;
}

interface AgentRunnerDeps {
	store: SessionStore;
	sessions: Map<string, ActiveSession>;
	runningAgents: Map<string, AbortController>;
	proxyUrl: string;
	emitSessionError: (params: { sessionId: string; error: string }) => void;
	emitPermissionRequest: (event: PermissionRequestEvent) => void;
	ensureSessionReady: (input: EnsureSessionReadyInput) => Promise<void>;
}

export class AgentRunner {
	constructor(private readonly deps: AgentRunnerDeps) {}

	private abortExistingAgent({ sessionId }: { sessionId: string }): void {
		const existingController = this.deps.runningAgents.get(sessionId);
		if (!existingController) return;
		console.warn(`[chat/session] Aborting previous agent run for ${sessionId}`);
		existingController.abort();
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
			this.deps.emitSessionError({ sessionId, error: reason });
			abortController.abort();
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
				this.deps.emitPermissionRequest({
					type: "permission_request",
					sessionId,
					toolUseId: params.toolUseId,
					toolName: params.toolName,
					input: params.input,
				});

				return createPermissionRequest({
					toolUseId: params.toolUseId,
					signal: params.signal,
				});
			},
			onEvent: (event) => {
				if (event.type === "session_initialized") {
					this.deps.store
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
			this.deps.emitSessionError({
				sessionId,
				error:
					"Assistant completion marker failed to persist. Message may stay loading.",
			});
		}

		await this.finishGeneration({ sessionId, session, messageId, headers });
	}

	async startAgent({ sessionId, prompt }: StartAgentInput): Promise<void> {
		const session = this.deps.sessions.get(sessionId);
		if (!session) {
			console.error(
				`[chat/session] Session ${sessionId} not found for startAgent`,
			);
			this.deps.emitSessionError({
				sessionId,
				error: "Session not active",
			});
			return;
		}

		this.abortExistingAgent({ sessionId });

		const abortController = new AbortController();
		this.deps.runningAgents.set(sessionId, abortController);

		const messageId = crypto.randomUUID();
		const watchdog = this.createWatchdog({ sessionId, abortController });
		let headers: Record<string, string> | null = null;
		let batcher: ChunkBatcher | null = null;

		try {
			await this.deps.ensureSessionReady({
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
				this.deps.emitSessionError({ sessionId, error: message });
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
			this.deps.runningAgents.delete(sessionId);
		}
	}

	resolvePermission({
		sessionId: _sessionId,
		toolUseId,
		approved,
		updatedInput,
	}: ResolvePermissionInput): void {
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
}
