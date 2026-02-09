import { EventEmitter } from "node:events";
import { env } from "main/env.main";
import type { AgentProvider } from "../agent-provider";
import type { SessionStore } from "../session-store";

const PROXY_URL = env.STREAMS_URL;
const STREAMS_SECRET = env.STREAMS_SECRET;

/**
 * Set, clear, or skip a field on a body template.
 * - `undefined` → no-op (field not mentioned in the update)
 * - `null`      → delete the field (revert to agent default)
 * - otherwise   → set the value
 */
function applyBodyField(
	template: Record<string, unknown>,
	key: string,
	value: unknown,
): void {
	if (value === undefined) return;
	if (value === null) {
		delete template[key];
	} else {
		template[key] = value;
	}
}

function buildProxyHeaders(): Record<string, string> {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${STREAMS_SECRET}`,
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

export type ClaudeStreamEvent =
	| SessionStartEvent
	| SessionEndEvent
	| ErrorEvent;

interface ActiveSession {
	sessionId: string;
	cwd: string;
}

export class ChatSessionManager extends EventEmitter {
	private sessions = new Map<string, ActiveSession>();

	constructor(
		private readonly provider: AgentProvider,
		private readonly store: SessionStore,
	) {
		super();
	}

	/**
	 * Register session with proxy: create/ensure session, register agent.
	 * Shared between startSession and restoreSession.
	 */
	private async ensureSessionReady({
		sessionId,
		cwd,
		paneId,
		tabId,
		workspaceId,
		model,
		permissionMode,
	}: {
		sessionId: string;
		cwd: string;
		paneId?: string;
		tabId?: string;
		workspaceId?: string;
		model?: string;
		permissionMode?: string;
	}): Promise<void> {
		const headers = buildProxyHeaders();

		const createRes = await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, {
			method: "PUT",
			headers,
		});
		if (!createRes.ok) {
			throw new Error(
				`PUT /v1/sessions/${sessionId} failed: ${createRes.status}`,
			);
		}

		const registration = this.provider.getAgentRegistration({
			sessionId,
			cwd,
			paneId,
			tabId,
			workspaceId,
			model,
			permissionMode,
		});
		const registerRes = await fetch(
			`${PROXY_URL}/v1/sessions/${sessionId}/agents`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ agents: [registration] }),
			},
		);
		if (!registerRes.ok) {
			throw new Error(
				`POST /v1/sessions/${sessionId}/agents failed: ${registerRes.status}`,
			);
		}

		this.sessions.set(sessionId, { sessionId, cwd });
	}

	async startSession({
		sessionId,
		workspaceId,
		cwd,
		paneId,
		tabId,
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
				paneId,
				tabId,
				workspaceId,
				model,
				permissionMode,
			});

			await this.store.create({
				sessionId,
				workspaceId,
				provider: this.provider.spec.id,
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
		paneId,
		tabId,
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
				paneId,
				tabId,
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

	async interrupt({ sessionId }: { sessionId: string }): Promise<void> {
		if (!this.sessions.has(sessionId)) {
			console.warn(
				`[chat/session] Session ${sessionId} not found for interrupt`,
			);
			return;
		}

		console.log(`[chat/session] Interrupting session ${sessionId}`);
		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers: buildProxyHeaders(),
				body: JSON.stringify({}),
			});
		} catch (error) {
			console.error(`[chat/session] Interrupt failed:`, error);
		}
	}

	async deactivateSession({ sessionId }: { sessionId: string }): Promise<void> {
		if (!this.sessions.has(sessionId)) {
			return;
		}

		console.log(`[chat/session] Deactivating session ${sessionId}`);

		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers: buildProxyHeaders(),
				body: JSON.stringify({}),
			});
		} catch (err) {
			console.debug(`[chat/session] Stop during deactivate failed:`, err);
		}

		try {
			const providerSessionId =
				await this.provider.getProviderSessionId(sessionId);
			if (providerSessionId) {
				await this.store.update(sessionId, {
					providerSessionId,
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
		const headers = buildProxyHeaders();

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

		await this.provider.cleanup(sessionId);
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

		const registration = this.provider.getAgentRegistration({
			sessionId,
			cwd: session.cwd,
		});

		const tpl = registration.bodyTemplate;
		applyBodyField(tpl, "maxThinkingTokens", maxThinkingTokens);
		applyBodyField(tpl, "model", model);
		applyBodyField(tpl, "permissionMode", permissionMode);

		const headers = buildProxyHeaders();
		const res = await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/agents`, {
			method: "POST",
			headers,
			body: JSON.stringify({ agents: [registration] }),
		});
		if (!res.ok) {
			throw new Error(
				`POST /v1/sessions/${sessionId}/agents failed: ${res.status}`,
			);
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
