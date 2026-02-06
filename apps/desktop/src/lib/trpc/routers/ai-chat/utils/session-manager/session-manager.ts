/**
 * Claude Code Session Manager
 *
 * Thin HTTP orchestrator that delegates to the proxy server for:
 * - Session lifecycle (create / stop / delete)
 * - Agent registration (Claude agent endpoint)
 * - Stream watching and message processing
 *
 * The proxy handles durable streams, reactive agent triggering,
 * and sequential invocation. This manager only tracks local state
 * and emits IPC events for the renderer.
 */

import { EventEmitter } from "node:events";
import { buildClaudeEnv } from "../auth";

const PROXY_URL = process.env.DURABLE_STREAM_URL || "http://localhost:8080";
const CLAUDE_AGENT_URL =
	process.env.CLAUDE_AGENT_URL || "http://localhost:9090";
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

// ============================================================================
// Events (unchanged — for local IPC subscribers)
// ============================================================================

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

// ============================================================================
// Active Session State (simplified — no query/producer/watcher)
// ============================================================================

interface ActiveSession {
	sessionId: string;
	cwd: string;
}

// ============================================================================
// Session Manager
// ============================================================================

class ClaudeSessionManager extends EventEmitter {
	private sessions = new Map<string, ActiveSession>();

	async startSession({
		sessionId,
		cwd,
	}: {
		sessionId: string;
		cwd: string;
	}): Promise<void> {
		if (this.sessions.has(sessionId)) {
			console.warn(`[claude/session] Session ${sessionId} already running`);
			return;
		}

		console.log(`[claude/session] Initializing session ${sessionId} in ${cwd}`);
		const headers = buildProxyHeaders();

		try {
			// 1. Create session on proxy
			const createRes = await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, {
				method: "PUT",
				headers,
			});
			if (!createRes.ok) {
				throw new Error(
					`PUT /v1/sessions/${sessionId} failed: ${createRes.status}`,
				);
			}

			// 2. Register Claude agent with bodyTemplate containing auth env
			const env = buildClaudeEnv();
			const registerRes = await fetch(
				`${PROXY_URL}/v1/sessions/${sessionId}/agents`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						agents: [
							{
								id: "claude",
								endpoint: `${CLAUDE_AGENT_URL}/`,
								triggers: "user-messages",
								bodyTemplate: {
									sessionId,
									cwd,
									env,
								},
							},
						],
					}),
				},
			);
			if (!registerRes.ok) {
				throw new Error(
					`POST /v1/sessions/${sessionId}/agents failed: ${registerRes.status}`,
				);
			}

			// 3. Track locally
			this.sessions.set(sessionId, { sessionId, cwd });

			this.emit("event", {
				type: "session_start",
				sessionId,
			} satisfies SessionStartEvent);

			console.log(`[claude/session] Session ${sessionId} started`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[claude/session] Failed to start session:`, message);
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
				`[claude/session] Session ${sessionId} not found for interrupt`,
			);
			return;
		}

		console.log(`[claude/session] Interrupting session ${sessionId}`);
		try {
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers: buildProxyHeaders(),
				body: JSON.stringify({}),
			});
		} catch (error) {
			console.error(`[claude/session] Interrupt failed:`, error);
		}
	}

	async stopSession({ sessionId }: { sessionId: string }): Promise<void> {
		if (!this.sessions.has(sessionId)) {
			return;
		}

		console.log(`[claude/session] Stopping session ${sessionId}`);
		const headers = buildProxyHeaders();

		try {
			// 1. Stop active generations
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}/stop`, {
				method: "POST",
				headers,
				body: JSON.stringify({}),
			});
		} catch (error) {
			console.warn(`[claude/session] Stop request failed (non-fatal):`, error);
		}

		try {
			// 2. Delete session on proxy
			await fetch(`${PROXY_URL}/v1/sessions/${sessionId}`, {
				method: "DELETE",
				headers,
			});
		} catch (error) {
			console.warn(
				`[claude/session] Delete request failed (non-fatal):`,
				error,
			);
		}

		// 3. Remove from local map
		this.sessions.delete(sessionId);

		this.emit("event", {
			type: "session_end",
			sessionId,
			exitCode: null,
		} satisfies SessionEndEvent);
	}

	isSessionActive(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	getActiveSessions(): string[] {
		return Array.from(this.sessions.keys());
	}
}

export const claudeSessionManager = new ClaudeSessionManager();
