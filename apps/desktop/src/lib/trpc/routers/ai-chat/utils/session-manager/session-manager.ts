import { EventEmitter } from "node:events";
import type { AgentProvider } from "../agent-provider";
import type { SessionStore } from "../session-store";

const PROXY_URL = process.env.DURABLE_STREAM_URL || "http://localhost:8080";
const DURABLE_STREAM_AUTH_TOKEN =
	process.env.DURABLE_STREAM_AUTH_TOKEN || process.env.DURABLE_STREAM_TOKEN;

function buildProxyHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (DURABLE_STREAM_AUTH_TOKEN) {
		headers.Authorization = `Bearer ${DURABLE_STREAM_AUTH_TOKEN}`;
	}
	return headers;
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

	async startSession({
		sessionId,
		workspaceId,
		cwd,
		paneId,
		tabId,
	}: {
		sessionId: string;
		workspaceId: string;
		cwd: string;
		paneId?: string;
		tabId?: string;
	}): Promise<void> {
		if (this.sessions.has(sessionId)) {
			console.warn(`[chat/session] Session ${sessionId} already active`);
			return;
		}

		console.log(`[chat/session] Starting session ${sessionId} in ${cwd}`);
		const headers = buildProxyHeaders();

		try {
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
	}: {
		sessionId: string;
		cwd: string;
		paneId?: string;
		tabId?: string;
	}): Promise<void> {
		if (this.sessions.has(sessionId)) {
			return;
		}

		console.log(`[chat/session] Restoring session ${sessionId}`);
		const headers = buildProxyHeaders();

		try {
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

	// Removes from active set but preserves the proxy session for later restore
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
		} catch {}

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
		} catch {}

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
		} catch {}

		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, {
				method: "DELETE",
				headers,
			});
		} catch {}

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

	isSessionActive(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	getActiveSessions(): string[] {
		return Array.from(this.sessions.keys());
	}
}
