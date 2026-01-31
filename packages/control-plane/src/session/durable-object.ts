/**
 * Session Durable Object
 *
 * Each cloud workspace session gets its own Durable Object instance with:
 * - SQLite database for persistent state
 * - WebSocket connections with hibernation support
 * - Prompt queue and event streaming
 */

import { DurableObject } from "cloudflare:workers";
import { initSchema, generateId } from "./schema";
import { createModalClient } from "../sandbox/client";
import { generateSandboxToken, hashToken } from "../auth/internal";
import type {
	Env,
	ClientInfo,
	ClientMessage,
	ServerMessage,
	SandboxEvent,
	SessionState,
	SessionRow,
	ParticipantRow,
	MessageRow,
	EventRow,
} from "../types";

const WS_AUTH_TIMEOUT_MS = 30000;

export class SessionDO extends DurableObject<Env> {
	private sql: SqlStorage;
	private clients: Map<WebSocket, ClientInfo>;
	private sandboxWs: WebSocket | null = null;
	private initialized = false;
	private isSpawningSandbox = false;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.clients = new Map();
	}

	/**
	 * Initialize the database schema if needed.
	 */
	private ensureInitialized(): void {
		if (this.initialized) return;
		initSchema(this.sql);
		this.initialized = true;
	}

	/**
	 * Safely send a message over a WebSocket.
	 */
	private safeSend(ws: WebSocket, message: ServerMessage): boolean {
		try {
			if (ws.readyState !== WebSocket.OPEN) {
				return false;
			}
			ws.send(JSON.stringify(message));
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Broadcast a message to all connected clients.
	 */
	private broadcast(message: ServerMessage, exclude?: WebSocket): void {
		for (const [ws] of this.clients) {
			if (ws !== exclude) {
				this.safeSend(ws, message);
			}
		}
	}

	/**
	 * Get current session state.
	 */
	private getSessionState(): SessionState | null {
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) return null;

		const session = rows[0] as unknown as SessionRow;
		const participantRows = this.sql
			.exec("SELECT * FROM participants WHERE session_id = ?", session.id)
			.toArray() as unknown as ParticipantRow[];

		const messageCount = this.sql
			.exec("SELECT COUNT(*) as count FROM messages WHERE session_id = ?", session.id)
			.toArray()[0] as { count: number };

		const eventCount = this.sql
			.exec("SELECT COUNT(*) as count FROM events WHERE session_id = ?", session.id)
			.toArray()[0] as { count: number };

		return {
			sessionId: session.id,
			status: session.status as SessionState["status"],
			sandboxStatus: session.sandbox_status as SessionState["sandboxStatus"],
			repoOwner: session.repo_owner,
			repoName: session.repo_name,
			branch: session.branch,
			baseBranch: session.base_branch,
			model: session.model,
			participants: participantRows.map((p) => ({
				id: p.id,
				userId: p.user_id,
				userName: p.github_name || p.github_login || "Unknown",
				avatarUrl: p.github_login ? `https://github.com/${p.github_login}.png` : undefined,
				source: p.source as "web" | "desktop" | "slack",
				isOnline: Date.now() - p.last_seen_at < 60000,
				lastSeenAt: p.last_seen_at,
			})),
			messageCount: messageCount.count,
			eventCount: eventCount.count,
			createdAt: session.created_at,
			updatedAt: session.updated_at,
		};
	}

	/**
	 * Handle HTTP requests to the Durable Object.
	 */
	async fetch(request: Request): Promise<Response> {
		this.ensureInitialized();

		const url = new URL(request.url);
		const path = url.pathname;

		// WebSocket upgrade for real-time connection
		if (request.headers.get("Upgrade") === "websocket") {
			return this.handleWebSocketUpgrade(request);
		}

		// Internal API routes
		if (path === "/internal/init" && request.method === "POST") {
			return this.handleInit(request);
		}

		if (path === "/internal/state" && request.method === "GET") {
			return this.handleGetState();
		}

		if (path === "/internal/prompt" && request.method === "POST") {
			return this.handleEnqueuePrompt(request);
		}

		if (path === "/internal/stop" && request.method === "POST") {
			return this.handleStop();
		}

		if (path === "/internal/sandbox-event" && request.method === "POST") {
			return this.handleSandboxEvent(request);
		}

		if (path === "/internal/events" && request.method === "GET") {
			return this.handleListEvents(url);
		}

		if (path === "/internal/messages" && request.method === "GET") {
			return this.handleListMessages(url);
		}

		if (path === "/internal/archive" && request.method === "POST") {
			return this.handleArchive();
		}

		return new Response("Not Found", { status: 404 });
	}

	/**
	 * Handle WebSocket upgrade requests.
	 */
	private handleWebSocketUpgrade(_request: Request): Response {
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		// Accept the WebSocket with hibernation support
		this.ctx.acceptWebSocket(server);

		// Set up auth timeout
		const timeoutId = setTimeout(() => {
			if (!this.clients.has(server)) {
				server.close(4001, "Authentication timeout");
			}
		}, WS_AUTH_TIMEOUT_MS);

		// Store timeout ID for cleanup
		server.serializeAttachment({ timeoutId });

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	/**
	 * Handle WebSocket messages (called by Cloudflare runtime).
	 */
	async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
		try {
			const data = JSON.parse(message) as ClientMessage;

			switch (data.type) {
				case "subscribe":
					await this.handleSubscribe(ws, data.token);
					break;

				case "prompt":
					await this.handlePrompt(ws, data.content, data.authorId);
					break;

				case "stop":
					await this.handleStopFromClient(ws);
					break;

				case "ping":
					this.safeSend(ws, { type: "pong" });
					break;
			}
		} catch (error) {
			console.error("[SessionDO] WebSocket message error:", error);
			this.safeSend(ws, { type: "error", message: "Invalid message format" });
		}
	}

	/**
	 * Handle WebSocket close (called by Cloudflare runtime).
	 */
	async webSocketClose(ws: WebSocket): Promise<void> {
		this.clients.delete(ws);

		// Clear auth timeout if set
		const attachment = ws.deserializeAttachment();
		if (attachment?.timeoutId) {
			clearTimeout(attachment.timeoutId);
		}
	}

	/**
	 * Handle WebSocket error (called by Cloudflare runtime).
	 */
	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		console.error("[SessionDO] WebSocket error:", error);
		this.clients.delete(ws);
	}

	/**
	 * Handle subscribe message from client.
	 */
	private async handleSubscribe(ws: WebSocket, token: string): Promise<void> {
		// TODO: Validate token and get user info
		// For now, accept all connections
		const clientInfo: ClientInfo = {
			participantId: generateId(),
			userId: "anonymous",
			userName: "Anonymous",
			source: "web",
			authenticatedAt: Date.now(),
		};

		this.clients.set(ws, clientInfo);

		// Clear auth timeout
		const attachment = ws.deserializeAttachment();
		if (attachment?.timeoutId) {
			clearTimeout(attachment.timeoutId);
		}

		// Send current state
		const state = this.getSessionState();
		if (state) {
			this.safeSend(ws, { type: "subscribed", sessionId: state.sessionId, state });
		}
	}

	/**
	 * Handle prompt message from client.
	 */
	private async handlePrompt(ws: WebSocket, content: string, authorId: string): Promise<void> {
		const clientInfo = this.clients.get(ws);
		if (!clientInfo) {
			this.safeSend(ws, { type: "error", message: "Not authenticated" });
			return;
		}

		// Get session
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			this.safeSend(ws, { type: "error", message: "Session not found" });
			return;
		}

		const session = rows[0] as unknown as SessionRow;

		// Create message record
		const messageId = generateId();
		this.sql.exec(
			`INSERT INTO messages (id, session_id, participant_id, content, role, status)
			 VALUES (?, ?, ?, ?, 'user', 'pending')`,
			messageId,
			session.id,
			clientInfo.participantId,
			content,
		);

		// Update session status
		this.sql.exec(
			"UPDATE session SET status = 'active', updated_at = ? WHERE id = ?",
			Date.now(),
			session.id,
		);

		// Broadcast state update
		const state = this.getSessionState();
		if (state) {
			this.broadcast({ type: "state_update", state });
		}

		// TODO: Forward prompt to sandbox via WebSocket
		// For now, just mark as completed
		this.sql.exec(
			"UPDATE messages SET status = 'processing' WHERE id = ?",
			messageId,
		);
	}

	/**
	 * Handle stop request from client.
	 */
	private async handleStopFromClient(ws: WebSocket): Promise<void> {
		const clientInfo = this.clients.get(ws);
		if (!clientInfo) {
			this.safeSend(ws, { type: "error", message: "Not authenticated" });
			return;
		}

		// TODO: Send stop signal to sandbox
		console.log("[SessionDO] Stop requested by client");
	}

	/**
	 * Initialize a new session.
	 */
	private async handleInit(request: Request): Promise<Response> {
		const body = (await request.json()) as {
			sessionId: string;
			organizationId: string;
			userId: string;
			repoOwner: string;
			repoName: string;
			branch: string;
			baseBranch: string;
			model?: string;
		};

		// Check if session already exists
		const existing = this.sql.exec("SELECT id FROM session LIMIT 1").toArray();
		if (existing.length > 0) {
			return Response.json({ success: true, sessionId: (existing[0] as { id: string }).id });
		}

		// Create session
		this.sql.exec(
			`INSERT INTO session (id, organization_id, user_id, repo_owner, repo_name, branch, base_branch, model)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			body.sessionId,
			body.organizationId,
			body.userId,
			body.repoOwner,
			body.repoName,
			body.branch,
			body.baseBranch,
			body.model || "claude-sonnet-4",
		);

		return Response.json({ success: true, sessionId: body.sessionId });
	}

	/**
	 * Get session state.
	 */
	private handleGetState(): Response {
		const state = this.getSessionState();
		if (!state) {
			return Response.json({ error: "Session not found" }, { status: 404 });
		}
		return Response.json(state);
	}

	/**
	 * Enqueue a prompt from the API.
	 */
	private async handleEnqueuePrompt(request: Request): Promise<Response> {
		const body = (await request.json()) as {
			content: string;
			authorId: string;
			participantId?: string;
		};

		// Get session
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			return Response.json({ error: "Session not found" }, { status: 404 });
		}

		const session = rows[0] as unknown as SessionRow;

		// Create message
		const messageId = generateId();
		this.sql.exec(
			`INSERT INTO messages (id, session_id, participant_id, content, role, status)
			 VALUES (?, ?, ?, ?, 'user', 'pending')`,
			messageId,
			session.id,
			body.participantId || null,
			body.content,
		);

		// Update session
		this.sql.exec(
			"UPDATE session SET status = 'active', updated_at = ? WHERE id = ?",
			Date.now(),
			session.id,
		);

		// Broadcast to clients
		const state = this.getSessionState();
		if (state) {
			this.broadcast({ type: "state_update", state });
		}

		return Response.json({ success: true, messageId });
	}

	/**
	 * Stop the current execution.
	 */
	private handleStop(): Response {
		// TODO: Send stop signal to sandbox
		return Response.json({ success: true });
	}

	/**
	 * Handle event from sandbox.
	 */
	private async handleSandboxEvent(request: Request): Promise<Response> {
		const event = (await request.json()) as SandboxEvent;

		// Get session
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			return Response.json({ error: "Session not found" }, { status: 404 });
		}

		const session = rows[0] as unknown as SessionRow;

		// Store event
		this.sql.exec(
			`INSERT INTO events (id, session_id, message_id, type, data)
			 VALUES (?, ?, ?, ?, ?)`,
			event.id || generateId(),
			session.id,
			event.messageId || null,
			event.type,
			JSON.stringify(event.data),
		);

		// Update sandbox status if applicable
		if (event.type === "git_sync") {
			this.sql.exec(
				"UPDATE session SET sandbox_status = 'syncing', updated_at = ? WHERE id = ?",
				Date.now(),
				session.id,
			);
		} else if (event.type === "execution_complete") {
			this.sql.exec(
				"UPDATE session SET sandbox_status = 'ready', updated_at = ? WHERE id = ?",
				Date.now(),
				session.id,
			);
		}

		// Broadcast to clients
		this.broadcast({ type: "event", event });

		return Response.json({ success: true });
	}

	/**
	 * List events with optional filtering.
	 */
	private handleListEvents(url: URL): Response {
		const type = url.searchParams.get("type");
		const limit = parseInt(url.searchParams.get("limit") || "100", 10);
		const offset = parseInt(url.searchParams.get("offset") || "0", 10);

		let query = "SELECT * FROM events";
		const params: (string | number)[] = [];

		if (type) {
			query += " WHERE type = ?";
			params.push(type);
		}

		query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
		params.push(limit, offset);

		const rows = this.sql.exec(query, ...params).toArray() as unknown as EventRow[];

		return Response.json({
			events: rows.map((row) => ({
				id: row.id,
				type: row.type,
				data: JSON.parse(row.data),
				messageId: row.message_id,
				createdAt: row.created_at,
			})),
		});
	}

	/**
	 * List messages.
	 */
	private handleListMessages(url: URL): Response {
		const status = url.searchParams.get("status");
		const limit = parseInt(url.searchParams.get("limit") || "100", 10);
		const offset = parseInt(url.searchParams.get("offset") || "0", 10);

		let query = "SELECT * FROM messages";
		const params: (string | number)[] = [];

		if (status) {
			query += " WHERE status = ?";
			params.push(status);
		}

		query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
		params.push(limit, offset);

		const rows = this.sql.exec(query, ...params).toArray() as unknown as MessageRow[];

		return Response.json({
			messages: rows.map((row) => ({
				id: row.id,
				content: row.content,
				role: row.role,
				status: row.status,
				participantId: row.participant_id,
				createdAt: row.created_at,
				completedAt: row.completed_at,
			})),
		});
	}

	/**
	 * Archive the session.
	 */
	private handleArchive(): Response {
		this.sql.exec(
			"UPDATE session SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = (SELECT id FROM session LIMIT 1)",
			Date.now(),
			Date.now(),
		);

		return Response.json({ success: true });
	}
}
