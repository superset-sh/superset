/**
 * AgentManager — manages StreamWatchers for sessions that are explicitly
 * requested via ensureRuntime/ensureWatcher.
 *
 * Session runtime readiness is now opt-in and request-driven. The manager no
 * longer depends on session_hosts subscriptions for send-time behavior.
 */

import { setAnthropicAuthToken } from "@superset/agent";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "../../auth/anthropic";
import type { GetHeaders } from "../../lib/auth/auth";
import type { ChatLifecycleEvent } from "../chat-service";
import {
	sessionAbortControllers,
	sessionContext,
	sessionRunIds,
} from "./session-state";
import { StreamWatcher } from "./stream-watcher";

export interface AgentManagerConfig {
	deviceId: string;
	organizationId: string;
	apiUrl: string;
	getHeaders: GetHeaders;
	onLifecycleEvent?: (event: ChatLifecycleEvent) => void;
}

export class AgentManager {
	private watchers = new Map<string, StreamWatcher>();
	private startingWatchers = new Map<string, Promise<StreamWatcher>>();
	private deviceId: string;
	private organizationId: string;
	private apiUrl: string;
	private getHeaders: GetHeaders;
	private onLifecycleEvent?: (event: ChatLifecycleEvent) => void;

	constructor(config: AgentManagerConfig) {
		this.deviceId = config.deviceId;
		this.organizationId = config.organizationId;
		this.apiUrl = config.apiUrl;
		this.getHeaders = config.getHeaders;
		this.onLifecycleEvent = config.onLifecycleEvent;
	}

	async start(): Promise<void> {
		// Initialize Claude credentials
		const cliCredentials =
			getCredentialsFromConfig() ?? getCredentialsFromKeychain();
		if (cliCredentials?.kind === "oauth") {
			setAnthropicAuthToken(cliCredentials.apiKey);
			console.log(
				`[agent-manager] Using Claude OAuth credentials from ${cliCredentials.source}`,
			);
		} else if (cliCredentials) {
			console.warn(
				`[agent-manager] Ignoring non-OAuth credentials from ${cliCredentials.source}`,
			);
		}

		console.log(
			`[agent-manager] Starting for org=${this.organizationId} device=${this.deviceId}`,
		);
	}

	hasWatcher(sessionId: string): boolean {
		return this.watchers.has(sessionId);
	}

	async ensureWatcher(
		sessionId: string,
		cwd?: string,
	): Promise<{ ready: boolean; reason?: string }> {
		const existing = this.watchers.get(sessionId);
		if (existing) {
			try {
				await existing.start();
				return { ready: true };
			} catch (err) {
				return {
					ready: false,
					reason: err instanceof Error ? err.message : String(err),
				};
			}
		}

		const inFlight = this.startingWatchers.get(sessionId);
		if (inFlight) {
			try {
				const watcher = await inFlight;
				this.watchers.set(sessionId, watcher);
				return { ready: true };
			} catch (err) {
				return {
					ready: false,
					reason: err instanceof Error ? err.message : String(err),
				};
			}
		}

		const startPromise = this.createStartedWatcher(sessionId, cwd);
		this.startingWatchers.set(sessionId, startPromise);
		try {
			const watcher = await startPromise;
			this.watchers.set(sessionId, watcher);
			this.logActiveSessions();
			return { ready: true };
		} catch (err) {
			return {
				ready: false,
				reason: err instanceof Error ? err.message : String(err),
			};
		} finally {
			this.startingWatchers.delete(sessionId);
		}
	}

	private async createStartedWatcher(
		sessionId: string,
		cwd?: string,
	): Promise<StreamWatcher> {
		const resolvedCwd = cwd || process.env.HOME || "/";
		const watcher = new StreamWatcher({
			sessionId,
			apiUrl: this.apiUrl,
			cwd: resolvedCwd,
			getHeaders: this.getHeaders,
			onLifecycleEvent: this.onLifecycleEvent,
		});
		try {
			await watcher.start();
			return watcher;
		} catch (err) {
			watcher.stop();
			throw err;
		}
	}

	private cleanupSession(sessionId: string): void {
		const controller = sessionAbortControllers.get(sessionId);
		if (controller) controller.abort();
		sessionAbortControllers.delete(sessionId);
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);
	}

	private logActiveSessions(): void {
		const ids = [...this.watchers.keys()];
		console.log(
			`[agent-manager] Active sessions (${ids.length}): ${ids.join(", ") || "none"}`,
		);
	}

	stop(): void {
		for (const [sessionId, watcher] of this.watchers) {
			watcher.stop();
			this.cleanupSession(sessionId);
		}
		this.watchers.clear();
		this.startingWatchers.clear();
		this.logActiveSessions();
	}

	async restart(options: {
		organizationId: string;
		deviceId?: string;
	}): Promise<void> {
		this.stop();
		this.organizationId = options.organizationId;
		if (options.deviceId) this.deviceId = options.deviceId;
		await this.start();
	}
}
