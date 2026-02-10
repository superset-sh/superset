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
import { loadToken } from "../../../auth/utils/auth-functions";
import { buildClaudeEnv } from "../auth";
import type { SessionStore } from "../session-store";

const PROXY_URL = env.STREAMS_URL;

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

async function buildProxyHeaders(): Promise<Record<string, string>> {
	const { token } = await loadToken();
	if (!token) {
		throw new Error("User not authenticated");
	}
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
	};
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

export interface ErrorEvent {
	type: "error";
	sessionId: string;
	error: string;
}

export interface PermissionRequestEvent {
	type: "permission_request";
	sessionId: string;
	toolUseId: string;
	toolName: string;
	input: Record<string, unknown>;
}

export type ClaudeStreamEvent =
	| SessionStartEvent
	| SessionEndEvent
	| ErrorEvent
	| PermissionRequestEvent;

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
			this.emit("event", {
				type: "error",
				sessionId,
				error: message,
			} satisfies ErrorEvent);
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
			this.emit("event", {
				type: "error",
				sessionId,
				error: message,
			} satisfies ErrorEvent);
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
			this.emit("event", {
				type: "error",
				sessionId,
				error: "Session not active",
			} satisfies ErrorEvent);
			return;
		}

		const existingController = this.runningAgents.get(sessionId);
		if (existingController) {
			console.warn(
				`[chat/session] Aborting previous agent run for ${sessionId}`,
			);
			existingController.abort();
		}

		const abortController = new AbortController();
		this.runningAgents.set(sessionId, abortController);

		const headers = await buildProxyHeaders();
		let messageId: string | undefined;

		try {
			const startRes = await fetch(
				`${PROXY_URL}/v1/sessions/${sessionId}/generations/start`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({}),
				},
			);
			if (!startRes.ok) {
				throw new Error(`POST /generations/start failed: ${startRes.status}`);
			}
			const startBody = await startRes.json();
			if (typeof startBody?.messageId !== "string") {
				throw new Error("Invalid start generation response: missing messageId");
			}
			messageId = startBody.messageId;

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

				onChunk: async (chunk) => {
					try {
						const chunkRes = await fetch(
							`${PROXY_URL}/v1/sessions/${sessionId}/chunks`,
							{
								method: "POST",
								headers,
								body: JSON.stringify({
									messageId,
									actorId: "claude",
									role: "assistant",
									chunk,
								}),
							},
						);
						if (!chunkRes.ok) {
							console.error(
								`[chat/session] POST chunk failed for ${sessionId}: ${chunkRes.status}`,
							);
						}
					} catch (err) {
						console.error(
							`[chat/session] Failed to POST chunk for ${sessionId}:`,
							err,
						);
					}
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
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				`[chat/session] Agent execution failed for ${sessionId}:`,
				message,
			);
			this.emit("event", {
				type: "error",
				sessionId,
				error: message,
			} satisfies ErrorEvent);
		} finally {
			// Always write a terminal chunk + finish so the client
			// materializes the message as complete (isLoading → false).
			if (messageId) {
				try {
					await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/chunks`, {
						method: "POST",
						headers,
						body: JSON.stringify({
							messageId,
							actorId: "claude",
							role: "assistant",
							chunk: { type: "message-end" },
						}),
					});
				} catch (err) {
					console.error(
						`[chat/session] Failed to write terminal chunk for ${sessionId}:`,
						err,
					);
				}

				try {
					await fetch(
						`${PROXY_URL}/v1/sessions/${sessionId}/generations/finish`,
						{
							method: "POST",
							headers,
							body: JSON.stringify({}),
						},
					);
				} catch (err) {
					console.error(
						`[chat/session] POST /generations/finish failed for ${sessionId}:`,
						err,
					);
				}
			}

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

		const controller = this.runningAgents.get(sessionId);
		if (controller) {
			controller.abort();
			this.runningAgents.delete(sessionId);
		}

		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers: await buildProxyHeaders(),
				body: JSON.stringify({}),
			});
		} catch (error) {
			console.error(`[chat/session] Interrupt proxy stop failed:`, error);
		}
	}

	async deactivateSession({ sessionId }: { sessionId: string }): Promise<void> {
		if (!this.sessions.has(sessionId)) {
			return;
		}

		console.log(`[chat/session] Deactivating session ${sessionId}`);

		const controller = this.runningAgents.get(sessionId);
		if (controller) {
			controller.abort();
			this.runningAgents.delete(sessionId);
		}

		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers: await buildProxyHeaders(),
				body: JSON.stringify({}),
			});
		} catch (err) {
			console.debug(`[chat/session] Stop during deactivate failed:`, err);
		}

		try {
			const claudeSessionId = getClaudeSessionId(sessionId);
			if (claudeSessionId) {
				await this.store.update(sessionId, {
					providerSessionId: claudeSessionId,
					lastActiveAt: Date.now(),
				});
			} else {
				await this.store.update(sessionId, {
					lastActiveAt: Date.now(),
				});
			}
		} catch (err) {
			console.debug(
				`[chat/session] Store update during deactivate failed:`,
				err,
			);
		}

		this.sessions.delete(sessionId);

		this.emit("event", {
			type: "session_end",
			sessionId,
			exitCode: null,
		} satisfies SessionEndEvent);
	}

	async deleteSession({ sessionId }: { sessionId: string }): Promise<void> {
		console.log(`[chat/session] Deleting session ${sessionId}`);
		const headers = await buildProxyHeaders();

		const controller = this.runningAgents.get(sessionId);
		if (controller) {
			controller.abort();
			this.runningAgents.delete(sessionId);
		}

		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers,
				body: JSON.stringify({}),
			});
		} catch (err) {
			console.debug(`[chat/session] Stop during delete failed:`, err);
		}

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

		this.emit("event", {
			type: "session_end",
			sessionId,
			exitCode: null,
		} satisfies SessionEndEvent);
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
