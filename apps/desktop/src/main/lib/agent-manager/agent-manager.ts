/**
 * AgentManager — watches session_hosts via Electric and manages StreamWatchers.
 *
 * Uses @electric-sql/client ShapeStream to subscribe to session_hosts rows
 * for the current org. Filters for rows where device_id matches this device.
 *
 * On new session row with matching device_id: creates a StreamWatcher.
 * On session deleted or device_id changed away: stops the StreamWatcher.
 */

import { Shape, ShapeStream } from "@electric-sql/client";
import { setAnthropicAuthToken } from "@superset/agent";
import { env } from "main/env.main";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "./utils/anthropic/auth";
import {
	sessionAbortControllers,
	sessionContext,
	sessionRunIds,
} from "./utils/run-agent";
import { StreamWatcher } from "./utils/stream-watcher";

export class AgentManager {
	private watchers = new Map<string, StreamWatcher>();
	private shape: Shape | null = null;
	private shapeStream: ShapeStream | null = null;
	private unsubscribe: (() => void) | null = null;
	private deviceId: string;
	private organizationId: string;
	private authToken: string;

	constructor(options: {
		deviceId: string;
		organizationId: string;
		authToken: string;
	}) {
		this.deviceId = options.deviceId;
		this.organizationId = options.organizationId;
		this.authToken = options.authToken;
	}

	async start(): Promise<void> {
		// In development, localhost uses self-signed certs that Node.js rejects
		if (env.NODE_ENV === "development") {
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
		}

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

		const electricUrl = env.NEXT_PUBLIC_ELECTRIC_URL;
		if (!electricUrl) {
			console.error("[agent-manager] No NEXT_PUBLIC_ELECTRIC_URL configured");
			return;
		}

		console.log(
			`[agent-manager] Starting for org=${this.organizationId} device=${this.deviceId}`,
		);

		const shapeUrl = `${electricUrl}/v1/shape`;
		const shapeParams = {
			table: "session_hosts",
			organizationId: this.organizationId,
		};

		this.shapeStream = new ShapeStream({
			url: shapeUrl,
			params: shapeParams,
			headers: {
				...(this.authToken
					? { Authorization: `Bearer ${this.authToken}` }
					: {}),
				"X-Electric-Backend": "cloud",
			},
		});

		this.shapeStream.subscribe(
			() => {},
			(error) => {
				console.error("[agent-manager] ShapeStream error:", error);
			},
		);

		this.shape = new Shape(this.shapeStream);

		const initialRows = await this.shape.rows;
		for (const row of initialRows) {
			if (row.device_id === this.deviceId) {
				this.startWatcher(row.session_id as string);
			}
		}

		this.unsubscribe = this.shape.subscribe(({ rows }) => {
			const activeSessionIds = new Set<string>();

			for (const row of rows) {
				if (row.device_id === this.deviceId) {
					const sessionId = row.session_id as string;
					activeSessionIds.add(sessionId);

					if (!this.watchers.has(sessionId)) {
						this.startWatcher(sessionId);
					}
				}
			}

			for (const [sessionId, watcher] of this.watchers) {
				if (!activeSessionIds.has(sessionId)) {
					watcher.stop();
					this.cleanupSession(sessionId);
					this.watchers.delete(sessionId);
				}
			}
		});

		this.logActiveSessions();
	}

	private startWatcher(sessionId: string): void {
		const watcher = new StreamWatcher({
			sessionId,
			authToken: this.authToken,
		});

		watcher.start();
		this.watchers.set(sessionId, watcher);
		this.logActiveSessions();
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
		this.unsubscribe?.();
		this.unsubscribe = null;

		for (const [sessionId, watcher] of this.watchers) {
			watcher.stop();
			this.cleanupSession(sessionId);
		}
		this.watchers.clear();

		this.shape = null;
		this.shapeStream = null;
		this.logActiveSessions();
	}

	/** Restart with a new org (e.g. on org switch). */
	async restart(options: {
		organizationId: string;
		deviceId?: string;
		authToken?: string;
	}): Promise<void> {
		this.stop();
		this.organizationId = options.organizationId;
		if (options.deviceId) this.deviceId = options.deviceId;
		if (options.authToken) this.authToken = options.authToken;
		await this.start();
	}
}
