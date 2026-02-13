import { EventEmitter } from "node:events";
import { env } from "main/env.main";
import type { SessionStore } from "../session-store";
import {
	AgentRunner,
	type ResolvePermissionInput,
	type StartAgentInput,
} from "./agent-runner";
import type {
	ErrorEvent,
	PermissionRequestEvent,
	SessionEndEvent,
	SessionStartEvent,
} from "./session-events";
import {
	type DeactivateSessionInput,
	type DeleteSessionInput,
	type InterruptInput,
	type RestoreSessionInput,
	SessionLifecycle,
	type StartSessionInput,
	type UpdateAgentConfigInput,
	type UpdateSessionMetaPatch,
} from "./session-lifecycle";
import type { ActiveSession } from "./session-types";

const PROXY_URL = env.NEXT_PUBLIC_STREAMS_URL;

export class ChatSessionManager extends EventEmitter {
	private readonly sessions = new Map<string, ActiveSession>();
	private readonly runningAgents = new Map<string, AbortController>();
	private readonly lifecycle: SessionLifecycle;
	private readonly agentRunner: AgentRunner;

	constructor(readonly store: SessionStore) {
		super();

		this.lifecycle = new SessionLifecycle({
			store,
			sessions: this.sessions,
			runningAgents: this.runningAgents,
			proxyUrl: PROXY_URL,
			emitSessionStart: ({ sessionId }) => {
				this.emit("event", {
					type: "session_start",
					sessionId,
				} satisfies SessionStartEvent);
			},
			emitSessionEnd: ({ sessionId }) => {
				this.emit("event", {
					type: "session_end",
					sessionId,
					exitCode: null,
				} satisfies SessionEndEvent);
			},
			emitSessionError: ({ sessionId, error }) => {
				this.emit("event", {
					type: "error",
					sessionId,
					error,
				} satisfies ErrorEvent);
			},
		});

		this.agentRunner = new AgentRunner({
			store,
			sessions: this.sessions,
			runningAgents: this.runningAgents,
			proxyUrl: PROXY_URL,
			ensureSessionReady: (input) => this.lifecycle.ensureSessionReady(input),
			emitSessionError: ({ sessionId, error }) => {
				this.emit("event", {
					type: "error",
					sessionId,
					error,
				} satisfies ErrorEvent);
			},
			emitPermissionRequest: (event: PermissionRequestEvent) => {
				this.emit("event", event);
			},
		});
	}

	async startSession(input: StartSessionInput): Promise<void> {
		await this.lifecycle.startSession(input);
	}

	async restoreSession(input: RestoreSessionInput): Promise<void> {
		await this.lifecycle.restoreSession(input);
	}

	async startAgent(input: StartAgentInput): Promise<void> {
		await this.agentRunner.startAgent(input);
	}

	resolvePermission(input: ResolvePermissionInput): void {
		this.agentRunner.resolvePermission(input);
	}

	async interrupt(input: InterruptInput): Promise<void> {
		await this.lifecycle.interrupt(input);
	}

	async deactivateSession(input: DeactivateSessionInput): Promise<void> {
		await this.lifecycle.deactivateSession(input);
	}

	async deleteSession(input: DeleteSessionInput): Promise<void> {
		await this.lifecycle.deleteSession(input);
	}

	async updateSessionMeta({
		sessionId,
		patch,
	}: {
		sessionId: string;
		patch: UpdateSessionMetaPatch;
	}): Promise<void> {
		await this.lifecycle.updateSessionMeta({ sessionId, patch });
	}

	async updateAgentConfig(input: UpdateAgentConfigInput): Promise<void> {
		await this.lifecycle.updateAgentConfig(input);
	}

	isSessionActive(sessionId: string): boolean {
		return this.lifecycle.isSessionActive(sessionId);
	}

	getActiveSessions(): string[] {
		return this.lifecycle.getActiveSessions();
	}
}
