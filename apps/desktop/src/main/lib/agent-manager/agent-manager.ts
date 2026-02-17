/**
 * AgentManager — watches session_hosts via Electric and manages StreamWatchers.
 *
 * Uses @electric-sql/client ShapeStream to subscribe to session_hosts rows
 * for the current org. Filters for rows where device_id matches this device.
 *
 * On new session row with matching device_id: creates a StreamWatcher.
 * On session deleted or device_id changed away: stops the StreamWatcher.
 */

import { ShapeStream, Shape } from "@electric-sql/client";
import { setAnthropicAuthToken } from "@superset/agent";
import { env } from "main/env.main";
import {
	getCredentialsFromConfig,
	getCredentialsFromKeychain,
} from "./utils/anthropic/auth";
import {
	sessionAbortControllers,
	sessionRunIds,
	sessionContext,
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

		// Subscribe to session_hosts via Electric ShapeStream
		const shapeUrl = `${electricUrl}/v1/shape`;
		const shapeParams = {
			table: "session_hosts",
			organizationId: this.organizationId,
		};
		console.log(
			`[agent-manager] Connecting to Electric: ${shapeUrl}`,
			shapeParams,
		);
		console.log(
			`[agent-manager] Auth token present: ${!!this.authToken} (len=${this.authToken?.length ?? 0})`,
		);

		// Diagnostic: test the Electric proxy directly before creating ShapeStream
		try {
			const testUrl = `${shapeUrl}?table=session_hosts&organizationId=${this.organizationId}&offset=-1`;
			const testRes = await fetch(testUrl, {
				headers: this.authToken
					? { Authorization: `Bearer ${this.authToken}` }
					: {},
			});
			const testBody = await testRes.text();
			console.log(
				`[agent-manager] Electric probe: status=${testRes.status} body=${testBody.slice(0, 500)}`,
			);
		} catch (err) {
			console.error("[agent-manager] Electric probe failed:", err);
		}

		this.shapeStream = new ShapeStream({
			url: shapeUrl,
			params: shapeParams,
			headers: this.authToken
				? { Authorization: `Bearer ${this.authToken}` }
				: {},
		});

		this.shapeStream.subscribe(
			(messages) => {
				console.log(
					`[agent-manager] ShapeStream raw messages: ${messages.length}`,
				);
			},
			(error) => {
				console.error("[agent-manager] ShapeStream error:", error);
			},
		);

		this.shape = new Shape(this.shapeStream);

		// Wait for initial data then process
		console.log("[agent-manager] Waiting for initial shape.rows...");
		const initialRows = await this.shape.rows;
		console.log(
			`[agent-manager] Initial session_hosts rows: ${initialRows.length}`,
		);
		for (const row of initialRows) {
			console.log(
				`[agent-manager] Row: device_id=${row.device_id} session_id=${row.session_id} (match=${row.device_id === this.deviceId})`,
			);
			if (row.device_id === this.deviceId) {
				this.startWatcher(row.session_id as string);
			}
		}

		this.unsubscribe = this.shape.subscribe(({ rows }) => {
			console.log(
				`[agent-manager] Electric subscription fired — ${rows.length} total rows`,
			);
			const activeSessionIds = new Set<string>();

			for (const row of rows) {
				console.log(
					`[agent-manager] Row: device_id=${row.device_id} session_id=${row.session_id} (match=${row.device_id === this.deviceId})`,
				);
				if (row.device_id === this.deviceId) {
					const sessionId = row.session_id as string;
					activeSessionIds.add(sessionId);

					if (!this.watchers.has(sessionId)) {
						this.startWatcher(sessionId);
					}
				}
			}

			// Stop watchers for sessions no longer assigned to this device
			for (const [sessionId, watcher] of this.watchers) {
				if (!activeSessionIds.has(sessionId)) {
					console.log(
						`[agent-manager] Session ${sessionId} no longer assigned to this device`,
					);
					watcher.stop();
					this.cleanupSession(sessionId);
					this.watchers.delete(sessionId);
				}
			}
		});

		console.log(
			`[agent-manager] Started — watching ${this.watchers.size} sessions`,
		);
	}

	private startWatcher(sessionId: string): void {
		console.log(
			`[agent-manager] Creating StreamWatcher for session ${sessionId}`,
		);

		const watcher = new StreamWatcher({
			sessionId,
			authToken: this.authToken,
			config: {
				// Default config — will be overridden by config events from the stream
				cwd: process.env.HOME || "/",
				modelId: "anthropic/claude-sonnet-4-5",
			},
		});

		watcher.start();
		this.watchers.set(sessionId, watcher);
	}

	private cleanupSession(sessionId: string): void {
		const controller = sessionAbortControllers.get(sessionId);
		if (controller) controller.abort();
		sessionAbortControllers.delete(sessionId);
		sessionRunIds.delete(sessionId);
		sessionContext.delete(sessionId);
	}

	stop(): void {
		console.log("[agent-manager] Stopping all watchers...");

		this.unsubscribe?.();
		this.unsubscribe = null;

		for (const [sessionId, watcher] of this.watchers) {
			watcher.stop();
			this.cleanupSession(sessionId);
		}
		this.watchers.clear();

		this.shape = null;
		this.shapeStream = null;

		console.log("[agent-manager] Stopped");
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
