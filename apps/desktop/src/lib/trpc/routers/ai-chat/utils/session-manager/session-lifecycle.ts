import { getClaudeSessionId } from "@superset/agent";
import type { SessionStore } from "../session-store";
import type {
	ActiveSession,
	EnsureSessionReadyInput,
	PermissionMode,
} from "./session-types";

export interface StartSessionInput {
	sessionId: string;
	workspaceId: string;
	cwd: string;
	paneId?: string;
	tabId?: string;
	model?: string;
	permissionMode?: PermissionMode;
}

export interface RestoreSessionInput {
	sessionId: string;
	cwd: string;
	paneId?: string;
	tabId?: string;
	model?: string;
	permissionMode?: PermissionMode;
}

export interface InterruptInput {
	sessionId: string;
}

export interface DeactivateSessionInput {
	sessionId: string;
}

export interface DeleteSessionInput {
	sessionId: string;
}

export interface UpdateSessionMetaPatch {
	title?: string;
	messagePreview?: string;
	providerSessionId?: string;
}

export interface UpdateAgentConfigInput {
	sessionId: string;
	maxThinkingTokens?: number | null;
	model?: string | null;
	permissionMode?: PermissionMode | null;
}

interface SessionLifecycleDeps {
	store: SessionStore;
	sessions: Map<string, ActiveSession>;
	runningAgents: Map<string, AbortController>;
	emitSessionStart: (params: { sessionId: string }) => void;
	emitSessionEnd: (params: { sessionId: string }) => void;
	emitSessionError: (params: { sessionId: string; error: string }) => void;
}

export class SessionLifecycle {
	constructor(private readonly deps: SessionLifecycleDeps) {}

	async ensureSessionReady({
		sessionId,
		cwd,
		model,
		permissionMode,
		maxThinkingTokens,
	}: EnsureSessionReadyInput): Promise<void> {
		this.deps.sessions.set(sessionId, {
			sessionId,
			cwd,
			model,
			permissionMode,
			maxThinkingTokens,
		});
	}

	private abortRunningAgent({ sessionId }: { sessionId: string }): void {
		const controller = this.deps.runningAgents.get(sessionId);
		if (!controller) return;
		controller.abort();
		if (this.deps.runningAgents.get(sessionId) === controller) {
			this.deps.runningAgents.delete(sessionId);
		}
	}

	private async updateDeactivatedSessionMeta({
		sessionId,
	}: {
		sessionId: string;
	}): Promise<void> {
		const claudeSessionId = getClaudeSessionId(sessionId);
		if (claudeSessionId) {
			await this.deps.store.update(sessionId, {
				providerSessionId: claudeSessionId,
				lastActiveAt: Date.now(),
			});
			return;
		}

		await this.deps.store.update(sessionId, {
			lastActiveAt: Date.now(),
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
	}: StartSessionInput): Promise<void> {
		if (this.deps.sessions.has(sessionId)) {
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

			await this.deps.store.create({
				sessionId,
				workspaceId,
				provider: "claude-sdk",
				title: "New chat",
				cwd,
				createdAt: Date.now(),
				lastActiveAt: Date.now(),
			});

			this.deps.emitSessionStart({ sessionId });
			console.log(`[chat/session] Session ${sessionId} started`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[chat/session] Failed to start session:`, message);
			this.deps.emitSessionError({ sessionId, error: message });
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(message);
		}
	}

	async restoreSession({
		sessionId,
		cwd,
		paneId: _paneId,
		tabId: _tabId,
		model,
		permissionMode,
	}: RestoreSessionInput): Promise<void> {
		if (this.deps.sessions.has(sessionId)) {
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

			await this.deps.store.update(sessionId, {
				lastActiveAt: Date.now(),
			});

			this.deps.emitSessionStart({ sessionId });
			console.log(`[chat/session] Session ${sessionId} restored`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[chat/session] Failed to restore session:`, message);
			this.deps.emitSessionError({ sessionId, error: message });
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(message);
		}
	}

	async interrupt({ sessionId }: InterruptInput): Promise<void> {
		if (!this.deps.sessions.has(sessionId)) {
			console.warn(
				`[chat/session] Session ${sessionId} not found for interrupt`,
			);
			return;
		}

		console.log(`[chat/session] Interrupting session ${sessionId}`);
		this.abortRunningAgent({ sessionId });
	}

	async deactivateSession({
		sessionId,
	}: DeactivateSessionInput): Promise<void> {
		if (!this.deps.sessions.has(sessionId)) {
			return;
		}

		console.log(`[chat/session] Deactivating session ${sessionId}`);
		this.abortRunningAgent({ sessionId });

		try {
			await this.updateDeactivatedSessionMeta({ sessionId });
		} catch (err) {
			console.debug(
				`[chat/session] Store update during deactivate failed:`,
				err,
			);
		}

		this.deps.sessions.delete(sessionId);
		this.deps.emitSessionEnd({ sessionId });
	}

	async deleteSession({ sessionId }: DeleteSessionInput): Promise<void> {
		console.log(`[chat/session] Deleting session ${sessionId}`);

		this.abortRunningAgent({ sessionId });
		await this.deps.store.archive(sessionId);
		this.deps.sessions.delete(sessionId);
		this.deps.emitSessionEnd({ sessionId });
	}

	async updateSessionMeta({
		sessionId,
		patch,
	}: {
		sessionId: string;
		patch: UpdateSessionMetaPatch;
	}): Promise<void> {
		await this.deps.store.update(sessionId, patch);
	}

	async updateAgentConfig({
		sessionId,
		maxThinkingTokens,
		model,
		permissionMode,
	}: UpdateAgentConfigInput): Promise<void> {
		const session = this.deps.sessions.get(sessionId);
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
		return this.deps.sessions.has(sessionId);
	}

	getActiveSessions(): string[] {
		return Array.from(this.deps.sessions.keys());
	}
}
