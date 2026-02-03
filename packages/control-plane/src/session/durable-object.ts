/**
 * Session Durable Object
 *
 * Each cloud workspace session gets its own Durable Object instance with:
 * - SQLite database for persistent state
 * - WebSocket connections with hibernation support
 * - Prompt queue and event streaming
 */

import { DurableObject } from "cloudflare:workers";
import { verifyInternalToken } from "../auth/internal";
import type {
	Artifact,
	ArtifactRow,
	ClientInfo,
	ClientMessage,
	ControlPlaneToSandboxMessage,
	Env,
	EventRow,
	FileChange,
	MessageRow,
	ParticipantRow,
	SandboxEvent,
	SandboxMessage,
	ServerMessage,
	SessionRow,
	SessionState,
} from "../types";
import { generateId, initSchema } from "./schema";

const WS_AUTH_TIMEOUT_MS = 30000;

export class SessionDO extends DurableObject<Env> {
	private sql: SqlStorage;
	private clients: Map<WebSocket, ClientInfo>;
	private sandboxWs: WebSocket | null = null;
	private sandboxInfo: { sandboxId: string; authenticatedAt: number } | null =
		null;
	private pendingMessages: Map<
		string,
		{
			content: string;
			createdAt: number;
			model?: string;
			author?: { userId: string; githubName: string | null; githubEmail: string | null };
			attachments?: Array<{
				type: string;
				name: string;
				url?: string;
				content?: string;
			}>;
		}
	> = new Map();
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
	 * Find the sandbox WebSocket (handles hibernation recovery).
	 */
	private findSandboxWebSocket(): WebSocket | null {
		// First check in-memory reference
		if (this.sandboxWs && this.sandboxWs.readyState === WebSocket.OPEN) {
			return this.sandboxWs;
		}

		// After hibernation, search through all WebSockets
		const allSockets = this.ctx.getWebSockets();
		for (const ws of allSockets) {
			if (this.isSandboxWebSocket(ws) && ws.readyState === WebSocket.OPEN) {
				return ws;
			}
		}

		return null;
	}

	/**
	 * Send a message to the connected sandbox.
	 */
	private sendToSandbox(message: ControlPlaneToSandboxMessage): boolean {
		const sandboxWs = this.findSandboxWebSocket();
		if (!sandboxWs) {
			console.error("[SessionDO] Cannot send to sandbox - not connected");
			return false;
		}
		try {
			sandboxWs.send(JSON.stringify(message));
			return true;
		} catch (error) {
			console.error("[SessionDO] Failed to send to sandbox:", error);
			return false;
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

		const artifactRows = this.sql
			.exec(
				"SELECT * FROM artifacts WHERE session_id = ? AND status = 'active' ORDER BY created_at DESC",
				session.id,
			)
			.toArray() as unknown as ArtifactRow[];

		const messageCount = this.sql
			.exec(
				"SELECT COUNT(*) as count FROM messages WHERE session_id = ?",
				session.id,
			)
			.toArray()[0] as { count: number };

		const eventCount = this.sql
			.exec(
				"SELECT COUNT(*) as count FROM events WHERE session_id = ?",
				session.id,
			)
			.toArray()[0] as { count: number };

		// Parse files_changed JSON
		let filesChanged: FileChange[] = [];
		try {
			filesChanged = session.files_changed
				? JSON.parse(session.files_changed)
				: [];
		} catch {
			filesChanged = [];
		}

		// Get modal_object_id from sandboxes table if we have a sandbox_id
		let modalObjectId: string | undefined;
		if (session.sandbox_id) {
			const sandboxRows = this.sql
				.exec(
					"SELECT modal_object_id FROM sandboxes WHERE id = ?",
					session.sandbox_id,
				)
				.toArray() as unknown as { modal_object_id: string | null }[];
			if (sandboxRows.length > 0 && sandboxRows[0].modal_object_id) {
				modalObjectId = sandboxRows[0].modal_object_id;
			}
		}

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
				avatarUrl: p.github_login
					? `https://github.com/${p.github_login}.png`
					: undefined,
				source: p.source as "web" | "desktop" | "slack",
				isOnline: Date.now() - p.last_seen_at < 60000,
				lastSeenAt: p.last_seen_at,
			})),
			artifacts: artifactRows.map((a) => this.mapArtifactRow(a)),
			filesChanged,
			messageCount: messageCount.count,
			eventCount: eventCount.count,
			createdAt: session.created_at,
			updatedAt: session.updated_at,
			snapshotId: session.snapshot_id ?? undefined,
			modalObjectId,
		};
	}

	/**
	 * Map an artifact row to the Artifact type.
	 */
	private mapArtifactRow(row: ArtifactRow): Artifact {
		return {
			id: row.id,
			type: row.type as Artifact["type"],
			url: row.url,
			title: row.title,
			description: row.description,
			metadata: row.metadata ? JSON.parse(row.metadata) : null,
			status: row.status as Artifact["status"],
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
	}

	/**
	 * Create or update an artifact.
	 */
	private upsertArtifact(params: {
		sessionId: string;
		type: Artifact["type"];
		url?: string;
		title?: string;
		description?: string;
		metadata?: Record<string, unknown>;
	}): Artifact {
		const { sessionId, type, url, title, description, metadata } = params;

		// Check if artifact of this type already exists
		const existingRows = this.sql
			.exec(
				"SELECT * FROM artifacts WHERE session_id = ? AND type = ? AND status = 'active'",
				sessionId,
				type,
			)
			.toArray() as unknown as ArtifactRow[];

		const now = Date.now();

		if (existingRows.length > 0) {
			// Update existing artifact
			const existing = existingRows[0];
			this.sql.exec(
				`UPDATE artifacts SET
					url = COALESCE(?, url),
					title = COALESCE(?, title),
					description = COALESCE(?, description),
					metadata = COALESCE(?, metadata),
					updated_at = ?
				WHERE id = ?`,
				url ?? null,
				title ?? null,
				description ?? null,
				metadata ? JSON.stringify(metadata) : null,
				now,
				existing.id,
			);

			const updated = this.sql
				.exec("SELECT * FROM artifacts WHERE id = ?", existing.id)
				.toArray()[0] as unknown as ArtifactRow;

			return this.mapArtifactRow(updated);
		}

		// Create new artifact
		const id = generateId();
		this.sql.exec(
			`INSERT INTO artifacts (id, session_id, type, url, title, description, metadata, status, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
			id,
			sessionId,
			type,
			url ?? null,
			title ?? null,
			description ?? null,
			metadata ? JSON.stringify(metadata) : null,
			now,
			now,
		);

		const created = this.sql
			.exec("SELECT * FROM artifacts WHERE id = ?", id)
			.toArray()[0] as unknown as ArtifactRow;

		return this.mapArtifactRow(created);
	}

	/**
	 * Get all active artifacts for a session.
	 */
	private getArtifacts(sessionId: string): Artifact[] {
		const rows = this.sql
			.exec(
				"SELECT * FROM artifacts WHERE session_id = ? AND status = 'active' ORDER BY created_at DESC",
				sessionId,
			)
			.toArray() as unknown as ArtifactRow[];

		return rows.map((row) => this.mapArtifactRow(row));
	}

	/**
	 * Broadcast artifacts update to all clients.
	 */
	private broadcastArtifactsUpdate(sessionId: string): void {
		const artifacts = this.getArtifacts(sessionId);
		this.broadcast({ type: "artifacts_update", artifacts });
	}

	/**
	 * Track file changes from tool events.
	 */
	private trackFileChanges(sessionId: string, event: SandboxEvent): void {
		if (event.type !== "tool_call") return;

		const data = event.data as { name?: string; input?: Record<string, unknown> };
		if (!data.name || !data.input) return;

		// Detect Write, Edit tool calls
		const toolName = data.name.toLowerCase();
		if (!["write", "edit"].includes(toolName)) return;

		const filePath = data.input.file_path as string | undefined;
		if (!filePath) return;

		// Get current files_changed
		const rows = this.sql.exec("SELECT files_changed FROM session WHERE id = ?", sessionId).toArray();
		if (rows.length === 0) return;

		const session = rows[0] as { files_changed: string };
		let filesChanged: FileChange[] = [];
		try {
			filesChanged = session.files_changed ? JSON.parse(session.files_changed) : [];
		} catch {
			filesChanged = [];
		}

		const now = Date.now();
		const existingIndex = filesChanged.findIndex((f) => f.path === filePath);

		if (existingIndex >= 0) {
			// Update existing entry
			filesChanged[existingIndex].lastModified = now;
			filesChanged[existingIndex].type = "modified";
		} else {
			// Add new entry
			filesChanged.push({
				path: filePath,
				type: toolName === "write" ? "added" : "modified",
				lastModified: now,
			});
		}

		// Sort by most recently modified
		filesChanged.sort((a, b) => b.lastModified - a.lastModified);

		// Limit to 100 files
		if (filesChanged.length > 100) {
			filesChanged = filesChanged.slice(0, 100);
		}

		// Update session
		this.sql.exec(
			"UPDATE session SET files_changed = ?, updated_at = ? WHERE id = ?",
			JSON.stringify(filesChanged),
			now,
			sessionId,
		);

		// Broadcast state update
		const state = this.getSessionState();
		if (state) {
			this.broadcast({ type: "state_update", state: { filesChanged: state.filesChanged } });
		}
	}

	/**
	 * Detect and create artifacts from sandbox events.
	 */
	private detectArtifactsFromEvent(
		sessionId: string,
		event: SandboxEvent,
	): void {
		// Detect PR creation from tool_result events
		if (event.type === "tool_result") {
			const data = event.data as { result?: string | unknown; error?: string };
			if (data.result && typeof data.result === "string") {
				// Look for GitHub PR URL patterns
				const prUrlMatch = data.result.match(
					/https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
				);
				if (prUrlMatch) {
					const [url, owner, repo, prNumber] = prUrlMatch;
					console.log("[SessionDO] Detected PR creation:", url);

					// Create PR artifact
					this.upsertArtifact({
						sessionId,
						type: "pr",
						url,
						title: `PR #${prNumber}`,
						description: `Pull request in ${owner}/${repo}`,
						metadata: {
							owner,
							repo,
							prNumber: Number.parseInt(prNumber, 10),
						},
					});

					// Also update session with PR info
					this.sql.exec(
						"UPDATE session SET pr_url = ?, pr_number = ?, updated_at = ? WHERE id = ?",
						url,
						Number.parseInt(prNumber, 10),
						Date.now(),
						sessionId,
					);

					// Broadcast artifacts update
					this.broadcastArtifactsUpdate(sessionId);
				}
			}
		}

		// Detect preview URL from tool events (if applicable)
		if (event.type === "tool_result") {
			const data = event.data as { result?: string | unknown };
			if (data.result && typeof data.result === "string") {
				// Look for Vercel preview URL pattern
				const previewMatch = data.result.match(
					/https:\/\/([a-z0-9-]+)\.vercel\.app/i,
				);
				if (previewMatch) {
					const [url] = previewMatch;
					console.log("[SessionDO] Detected preview URL:", url);

					this.upsertArtifact({
						sessionId,
						type: "preview",
						url,
						title: "Preview Deployment",
						description: "Vercel preview deployment",
					});

					this.broadcastArtifactsUpdate(sessionId);
				}
			}
		}
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

		if (path === "/internal/artifacts" && request.method === "GET") {
			return this.handleListArtifacts();
		}

		if (path === "/internal/update-snapshot" && request.method === "POST") {
			return this.handleUpdateSnapshot(request);
		}

		if (path === "/internal/update-sandbox" && request.method === "POST") {
			return this.handleUpdateSandbox(request);
		}

		return new Response("Not Found", { status: 404 });
	}

	/**
	 * Handle POST /internal/update-snapshot - Update session's snapshot ID.
	 */
	private async handleUpdateSnapshot(request: Request): Promise<Response> {
		const body = (await request.json()) as { snapshotId: string };

		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			return Response.json({ error: "Session not found" }, { status: 404 });
		}

		const session = rows[0] as unknown as SessionRow;

		// Update session with snapshot ID
		this.sql.exec(
			"UPDATE session SET snapshot_id = ?, updated_at = ? WHERE id = ?",
			body.snapshotId,
			Date.now(),
			session.id,
		);

		// Also record in sandboxes table if we have a sandbox
		if (session.sandbox_id) {
			this.sql.exec(
				"UPDATE sandboxes SET snapshot_id = ? WHERE id = ?",
				body.snapshotId,
				session.sandbox_id,
			);
		}

		console.log(`[SessionDO] Updated snapshot_id: ${body.snapshotId}`);

		return Response.json({ success: true, snapshotId: body.snapshotId });
	}

	/**
	 * Handle POST /internal/update-sandbox - Store sandbox info after spawn.
	 */
	private async handleUpdateSandbox(request: Request): Promise<Response> {
		const body = (await request.json()) as {
			sandboxId: string;
			modalObjectId?: string;
			status: string;
		};

		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			return Response.json({ error: "Session not found" }, { status: 404 });
		}

		const session = rows[0] as unknown as SessionRow;
		const now = Date.now();

		// Create or update sandbox record
		this.sql.exec(
			`INSERT INTO sandboxes (id, session_id, modal_object_id, status, created_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET
				modal_object_id = COALESCE(?, modal_object_id),
				status = ?`,
			body.sandboxId,
			session.id,
			body.modalObjectId ?? null,
			body.status,
			now,
			body.modalObjectId ?? null,
			body.status,
		);

		// Update session with sandbox_id reference
		this.sql.exec(
			"UPDATE session SET sandbox_id = ?, updated_at = ? WHERE id = ?",
			body.sandboxId,
			now,
			session.id,
		);

		console.log(
			`[SessionDO] Updated sandbox: id=${body.sandboxId}, modal_object_id=${body.modalObjectId}`,
		);

		return Response.json({
			success: true,
			sandboxId: body.sandboxId,
			modalObjectId: body.modalObjectId,
		});
	}

	/**
	 * Handle GET /internal/artifacts - List all artifacts.
	 */
	private handleListArtifacts(): Response {
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			return Response.json({ error: "Session not found" }, { status: 404 });
		}

		const session = rows[0] as unknown as SessionRow;
		const artifacts = this.getArtifacts(session.id);

		return Response.json({ artifacts });
	}

	/**
	 * Handle WebSocket upgrade requests.
	 */
	private handleWebSocketUpgrade(_request: Request): Response {
		console.log("[SessionDO] WebSocket upgrade request received");
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		// Accept the WebSocket with hibernation support
		this.ctx.acceptWebSocket(server);
		console.log("[SessionDO] WebSocket accepted");

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
	 * Check if a WebSocket is the sandbox connection (survives hibernation).
	 */
	private isSandboxWebSocket(ws: WebSocket): boolean {
		// First check in-memory reference
		if (ws === this.sandboxWs) return true;

		// Check attachment for hibernation recovery
		try {
			const attachment = ws.deserializeAttachment();
			if (attachment?.isSandbox) {
				// Restore the in-memory reference
				this.sandboxWs = ws;
				this.sandboxInfo = {
					sandboxId: attachment.sandboxId,
					authenticatedAt: attachment.authenticatedAt,
				};
				return true;
			}
		} catch {
			// Attachment may not exist
		}
		return false;
	}

	/**
	 * Handle WebSocket messages (called by Cloudflare runtime).
	 */
	async webSocketMessage(ws: WebSocket, message: string): Promise<void> {
		console.log(
			"[SessionDO] webSocketMessage received, length:",
			message.length,
		);
		try {
			const data = JSON.parse(message);
			console.log("[SessionDO] Parsed message type:", data.type);

			// Check if this is a sandbox message
			if (data.type === "sandbox_connect") {
				await this.handleSandboxConnect(ws, data as SandboxMessage);
				return;
			}

			// Check if this is from the sandbox (handles hibernation recovery)
			if (this.isSandboxWebSocket(ws)) {
				await this.handleSandboxMessage(data as SandboxMessage);
				return;
			}

			// Otherwise, it's a client message
			const clientData = data as ClientMessage;
			console.log(
				"[SessionDO] Client message received, type:",
				clientData.type,
			);

			switch (clientData.type) {
				case "subscribe":
					await this.handleSubscribe(ws, clientData.token);
					break;

				case "prompt":
					console.log("[SessionDO] Processing prompt message");
					await this.handlePrompt(
						ws,
						clientData.content,
						clientData.authorId,
						clientData.model,
						clientData.attachments,
					);
					break;

				case "stop":
					await this.handleStopFromClient(ws);
					break;

				case "push":
					await this.handlePushFromClient(ws, clientData.branchName, clientData.repoOwner, clientData.repoName);
					break;

				case "snapshot":
					await this.handleSnapshotFromClient(ws);
					break;

				case "shutdown":
					await this.handleShutdownFromClient(ws);
					break;

				case "ping":
					this.safeSend(ws, { type: "pong" });
					break;

				case "typing":
					await this.handleTyping();
					break;
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			const errorStack = error instanceof Error ? error.stack : undefined;
			console.error("[SessionDO] WebSocket message error:", errorMsg);
			if (errorStack) {
				console.error("[SessionDO] Stack trace:", errorStack);
			}
			console.error("[SessionDO] Raw message was:", message);
			this.safeSend(ws, {
				type: "error",
				message: `Message error: ${errorMsg}`,
			});
		}
	}

	/**
	 * Handle WebSocket close (called by Cloudflare runtime).
	 */
	async webSocketClose(ws: WebSocket): Promise<void> {
		// Check if sandbox disconnected (including after hibernation)
		if (this.isSandboxWebSocket(ws)) {
			console.log("[SessionDO] Sandbox disconnected");
			this.sandboxWs = null;
			this.sandboxInfo = null;

			// Update sandbox status
			const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
			if (rows.length > 0) {
				const session = rows[0] as unknown as SessionRow;
				this.sql.exec(
					"UPDATE session SET sandbox_status = 'stopped', updated_at = ? WHERE id = ?",
					Date.now(),
					session.id,
				);

				// Broadcast state update
				const state = this.getSessionState();
				if (state) {
					this.broadcast({ type: "state_update", state });
				}
			}
			return;
		}

		// Otherwise it's a client disconnecting
		const clientInfo = this.clients.get(ws);
		this.clients.delete(ws);

		// Clear auth timeout if set
		const attachment = ws.deserializeAttachment();
		if (attachment?.timeoutId) {
			clearTimeout(attachment.timeoutId);
		}

		// Broadcast presence leave if we had client info
		if (clientInfo) {
			const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
			if (rows.length > 0) {
				const session = rows[0] as unknown as SessionRow;
				const now = Date.now();

				// Update participant's last_seen_at in database
				this.sql.exec(
					"UPDATE participants SET last_seen_at = ? WHERE id = ?",
					now,
					clientInfo.participantId,
				);

				// Get participant record for the presence update
				const participantRows = this.sql
					.exec(
						"SELECT * FROM participants WHERE id = ?",
						clientInfo.participantId,
					)
					.toArray() as unknown as ParticipantRow[];

				if (participantRows.length > 0) {
					const p = participantRows[0];
					this.broadcast({
						type: "presence_update",
						action: "leave",
						participant: {
							id: p.id,
							userId: p.user_id,
							userName: p.github_name || p.github_login || "Unknown",
							avatarUrl: p.github_login
								? `https://github.com/${p.github_login}.png`
								: undefined,
							source: p.source as "web" | "desktop" | "slack",
							isOnline: false,
							lastSeenAt: now,
						},
					});
				}

				console.log(
					"[SessionDO] Client disconnected, participant:",
					clientInfo.participantId,
				);
			}
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
	private async handleSubscribe(ws: WebSocket, _token: string): Promise<void> {
		// TODO: Validate token and get user info
		// For now, accept all connections with a consistent anonymous user
		const userId = "anonymous";
		const userName = "Anonymous";
		const source = "web";

		// Clear auth timeout
		const attachment = ws.deserializeAttachment();
		if (attachment?.timeoutId) {
			clearTimeout(attachment.timeoutId);
		}

		// Get session and upsert participant record
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			console.error("[SessionDO] handleSubscribe: No session found in database");
			this.safeSend(ws, {
				type: "error",
				message: "Session not found or not initialized",
			});
			return;
		}

		const session = rows[0] as unknown as SessionRow;
		const now = Date.now();

		// Check if participant already exists for this user in this session
		const existingParticipants = this.sql
			.exec(
				"SELECT * FROM participants WHERE session_id = ? AND user_id = ? AND source = ?",
				session.id,
				userId,
				source,
			)
			.toArray() as unknown as ParticipantRow[];

		let participantId: string;

		if (existingParticipants.length > 0) {
			// Reuse existing participant record
			participantId = existingParticipants[0].id;
			this.sql.exec(
				"UPDATE participants SET last_seen_at = ? WHERE id = ?",
				now,
				participantId,
			);
		} else {
			// Create new participant record
			participantId = generateId();
			this.sql.exec(
				`INSERT INTO participants (id, session_id, user_id, source, joined_at, last_seen_at)
				 VALUES (?, ?, ?, ?, ?, ?)`,
				participantId,
				session.id,
				userId,
				source,
				now,
				now,
			);
		}

		const clientInfo: ClientInfo = {
			participantId,
			userId,
			userName,
			source,
			authenticatedAt: Date.now(),
		};

		this.clients.set(ws, clientInfo);

		// Send current state
		const state = this.getSessionState();
		if (state) {
			this.safeSend(ws, {
				type: "subscribed",
				sessionId: state.sessionId,
				state,
			});

			// Send historical messages and events for chat history persistence
			this.sendHistory(ws, state.sessionId);

			// Send presence sync (all current participants)
			this.safeSend(ws, {
				type: "presence_sync",
				participants: state.participants,
			});

			// Broadcast presence update (join) to other clients
			const joiningParticipant = state.participants.find(
				(p) => p.id === participantId,
			);
			if (joiningParticipant) {
				this.broadcast(
					{
						type: "presence_update",
						action: "join",
						participant: joiningParticipant,
					},
					ws, // exclude the joining client
				);
			}
		}
	}

	/**
	 * Send historical messages and events to a newly connected client.
	 */
	private sendHistory(ws: WebSocket, sessionId: string): void {
		// Send last 100 messages
		const messages = this.sql
			.exec(
				`SELECT id, content, role, status, participant_id, created_at, completed_at
				 FROM messages WHERE session_id = ?
				 ORDER BY created_at ASC LIMIT 100`,
				sessionId,
			)
			.toArray() as unknown as MessageRow[];

		if (messages.length > 0) {
			this.safeSend(ws, {
				type: "history",
				messages: messages.map((m) => ({
					id: m.id,
					content: m.content,
					role: m.role,
					status: m.status,
					participantId: m.participant_id,
					createdAt: m.created_at,
					completedAt: m.completed_at,
				})),
			});
		}

		// Send last 500 events (excluding heartbeats)
		const events = this.sql
			.exec(
				`SELECT id, message_id, type, data, created_at
				 FROM events WHERE session_id = ? AND type != 'heartbeat'
				 ORDER BY created_at ASC LIMIT 500`,
				sessionId,
			)
			.toArray() as unknown as EventRow[];

		for (const event of events) {
			this.safeSend(ws, {
				type: "event",
				event: {
					id: event.id,
					messageId: event.message_id || undefined,
					type: event.type as SandboxEvent["type"],
					data: JSON.parse(event.data),
					timestamp: event.created_at,
				},
			});
		}

		console.log(
			`[SessionDO] Sent history: ${messages.length} messages, ${events.length} events`,
		);
	}

	/**
	 * Handle prompt message from client.
	 */
	private async handlePrompt(
		ws: WebSocket,
		content: string,
		authorId: string,
		model?: string,
		attachments?: Array<{
			type: string;
			name: string;
			url?: string;
			content?: string;
		}>,
	): Promise<void> {
		// Validate required fields
		if (!content || typeof content !== "string") {
			console.error("[SessionDO] handlePrompt: invalid content:", content);
			this.safeSend(ws, {
				type: "error",
				message: "Prompt content is required",
			});
			return;
		}

		// Note: participant_id is set to null until we implement proper participant management
		// The participantId in clientInfo is generated but never inserted into participants table
		// TODO: Create participant record in handleSubscribe when we add proper auth
		console.log(
			"[SessionDO] handlePrompt: content length =",
			content.length,
			"authorId =",
			authorId,
			"model =",
			model,
		);

		// Get session
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			this.safeSend(ws, { type: "error", message: "Session not found" });
			return;
		}

		const session = rows[0] as unknown as SessionRow;

		// Get participant info for author context
		const client = this.clients.get(ws);
		const participantRows = client?.participantId
			? this.sql
					.exec(
						"SELECT * FROM participants WHERE id = ?",
						client.participantId,
					)
					.toArray()
			: [];
		const participant =
			participantRows.length > 0
				? (participantRows[0] as unknown as ParticipantRow)
				: null;

		// Build author context for git identity
		const author = participant
			? {
					userId: participant.user_id,
					githubName: participant.github_name,
					githubEmail: participant.github_login
						? `${participant.github_login}@users.noreply.github.com`
						: null,
				}
			: undefined;

		// Create message record (participant_id is null until we implement proper participant management)
		const messageId = generateId();
		this.sql.exec(
			`INSERT INTO messages (id, session_id, participant_id, content, role, status)
			 VALUES (?, ?, NULL, ?, 'user', 'pending')`,
			messageId,
			session.id,
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

		// Use per-message model or fall back to session model
		const effectiveModel = model || session.model;

		// Build rich prompt command
		const promptCommand: ControlPlaneToSandboxMessage = {
			type: "prompt",
			messageId,
			content,
			model: effectiveModel,
			author,
			attachments,
		};

		// Forward prompt to sandbox via WebSocket
		const sandboxWs = this.findSandboxWebSocket();
		if (sandboxWs) {
			if (this.sendToSandbox(promptCommand)) {
				console.log("[SessionDO] Prompt forwarded to sandbox:", messageId);
				// Send ack to client indicating prompt was forwarded
				this.safeSend(ws, {
					type: "prompt_ack",
					messageId,
					status: "forwarded",
				});
			} else {
				// Sandbox disconnected, queue the message
				this.pendingMessages.set(messageId, {
					content,
					createdAt: Date.now(),
					model: effectiveModel,
					author,
					attachments,
				});
				console.log(
					"[SessionDO] Sandbox connection lost, queueing message:",
					messageId,
				);
				this.safeSend(ws, {
					type: "prompt_ack",
					messageId,
					status: "queued",
					message:
						"Sandbox connection lost, message queued for when it reconnects",
				});
			}
		} else {
			// No sandbox connected, queue the message for when it connects
			this.pendingMessages.set(messageId, {
				content,
				createdAt: Date.now(),
				model: effectiveModel,
				author,
				attachments,
			});
			console.log(
				"[SessionDO] Sandbox not connected, message queued:",
				messageId,
			);
			// Inform client that the message is queued, not processing
			this.safeSend(ws, {
				type: "prompt_ack",
				messageId,
				status: "queued",
				message:
					"Sandbox not connected. Message queued and will be processed when sandbox connects.",
			});
		}
	}

	/**
	 * Handle stop request from client.
	 */
	private async handleStopFromClient(ws: WebSocket): Promise<void> {
		console.log("[SessionDO] Stop requested by client");
		if (this.sendToSandbox({ type: "stop" })) {
			this.safeSend(ws, { type: "stop_ack", status: "sent" });
		} else {
			console.log("[SessionDO] Cannot send stop - sandbox not connected");
			this.safeSend(ws, {
				type: "stop_ack",
				status: "failed",
				message: "Sandbox not connected",
			});
		}
	}

	/**
	 * Handle push request from client.
	 */
	private async handlePushFromClient(
		ws: WebSocket,
		branchName: string,
		repoOwner?: string,
		repoName?: string,
	): Promise<void> {
		console.log("[SessionDO] Push requested by client, branch:", branchName);

		// Get session for defaults
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) {
			this.safeSend(ws, {
				type: "push_ack",
				status: "failed",
				message: "Session not found",
			});
			return;
		}

		const session = rows[0] as unknown as SessionRow;

		// Build push command with session defaults
		const pushCommand: ControlPlaneToSandboxMessage = {
			type: "push",
			branchName: branchName || session.branch,
			repoOwner: repoOwner || session.repo_owner,
			repoName: repoName || session.repo_name,
		};

		if (this.sendToSandbox(pushCommand)) {
			this.safeSend(ws, { type: "push_ack", status: "sent" });
		} else {
			console.log("[SessionDO] Cannot send push - sandbox not connected");
			this.safeSend(ws, {
				type: "push_ack",
				status: "failed",
				message: "Sandbox not connected",
			});
		}
	}

	/**
	 * Handle snapshot request from client.
	 */
	private async handleSnapshotFromClient(ws: WebSocket): Promise<void> {
		console.log("[SessionDO] Snapshot requested by client");
		if (this.sendToSandbox({ type: "snapshot" })) {
			this.safeSend(ws, { type: "snapshot_ack", status: "sent" });
		} else {
			console.log("[SessionDO] Cannot send snapshot - sandbox not connected");
			this.safeSend(ws, {
				type: "snapshot_ack",
				status: "failed",
				message: "Sandbox not connected",
			});
		}
	}

	/**
	 * Handle shutdown request from client.
	 */
	private async handleShutdownFromClient(ws: WebSocket): Promise<void> {
		console.log("[SessionDO] Shutdown requested by client");
		if (this.sendToSandbox({ type: "shutdown" })) {
			this.safeSend(ws, { type: "shutdown_ack", status: "sent" });

			// Update session status
			const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
			if (rows.length > 0) {
				const session = rows[0] as unknown as SessionRow;
				this.sql.exec(
					"UPDATE session SET sandbox_status = 'stopped', updated_at = ? WHERE id = ?",
					Date.now(),
					session.id,
				);

				// Broadcast state update
				const state = this.getSessionState();
				if (state) {
					this.broadcast({ type: "state_update", state });
				}
			}
		} else {
			console.log("[SessionDO] Cannot send shutdown - sandbox not connected");
			this.safeSend(ws, {
				type: "shutdown_ack",
				status: "failed",
				message: "Sandbox not connected",
			});
		}
	}

	/**
	 * Handle typing indicator from client - triggers sandbox pre-warming.
	 * This allows the sandbox to start before the user submits their prompt.
	 */
	private async handleTyping(): Promise<void> {
		// Get current session state
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		if (rows.length === 0) return;

		const session = rows[0] as unknown as SessionRow;

		// If sandbox is already running/ready/warming, or we're already spawning, skip
		if (
			session.sandbox_status === "ready" ||
			session.sandbox_status === "running" ||
			session.sandbox_status === "warming" ||
			session.sandbox_status === "syncing" ||
			this.isSpawningSandbox
		) {
			return;
		}

		// Check if sandbox is connected
		const sandboxWs = this.findSandboxWebSocket();
		if (sandboxWs) {
			return; // Sandbox is already connected
		}

		console.log("[SessionDO] Typing detected, pre-warming sandbox");
		this.isSpawningSandbox = true;

		// Update status to warming
		this.sql.exec(
			"UPDATE session SET sandbox_status = 'warming', updated_at = ? WHERE id = ?",
			Date.now(),
			session.id,
		);

		// Broadcast state update
		const state = this.getSessionState();
		if (state) {
			this.broadcast({ type: "state_update", state });
		}

		// Trigger sandbox spawn via Modal API
		try {
			const spawnUrl = `https://${this.env.MODAL_WORKSPACE}--superset-cloud-api-spawn-sandbox.modal.run`;
			const response = await fetch(spawnUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					sessionId: session.id,
					controlPlaneUrl: this.env.CONTROL_PLANE_URL,
					repoOwner: session.repo_owner,
					repoName: session.repo_name,
					branch: session.branch,
					baseBranch: session.base_branch,
					model: session.model,
				}),
			});

			if (!response.ok) {
				console.error(
					"[SessionDO] Failed to spawn sandbox on typing:",
					await response.text(),
				);
				// Reset status on failure
				this.sql.exec(
					"UPDATE session SET sandbox_status = 'stopped', updated_at = ? WHERE id = ?",
					Date.now(),
					session.id,
				);
				const updatedState = this.getSessionState();
				if (updatedState) {
					this.broadcast({ type: "state_update", state: updatedState });
				}
			} else {
				console.log("[SessionDO] Sandbox spawn initiated from typing");
			}
		} catch (error) {
			console.error("[SessionDO] Error spawning sandbox on typing:", error);
			// Reset status on error
			this.sql.exec(
				"UPDATE session SET sandbox_status = 'stopped', updated_at = ? WHERE id = ?",
				Date.now(),
				session.id,
			);
		} finally {
			this.isSpawningSandbox = false;
		}
	}

	/**
	 * Handle sandbox connection request.
	 */
	private async handleSandboxConnect(
		ws: WebSocket,
		data: SandboxMessage,
	): Promise<void> {
		console.log("[SessionDO] handleSandboxConnect called with sandboxId:", data.type === "sandbox_connect" ? data.sandboxId : "N/A");
		if (data.type !== "sandbox_connect") return;

		// Verify the sandbox token
		const isValid = await verifyInternalToken(
			data.token,
			this.env.MODAL_API_SECRET,
		);
		console.log("[SessionDO] Token validation result:", isValid);
		if (!isValid) {
			console.error("[SessionDO] Invalid sandbox token");
			ws.close(4001, "Invalid token");
			return;
		}

		// Store sandbox connection
		const authenticatedAt = Date.now();
		this.sandboxWs = ws;
		this.sandboxInfo = {
			sandboxId: data.sandboxId,
			authenticatedAt,
		};

		// Clear auth timeout and mark as sandbox (survives hibernation)
		const oldAttachment = ws.deserializeAttachment();
		if (oldAttachment?.timeoutId) {
			clearTimeout(oldAttachment.timeoutId);
		}
		// Store sandbox info in attachment for hibernation recovery
		ws.serializeAttachment({
			isSandbox: true,
			sandboxId: data.sandboxId,
			authenticatedAt,
		});

		// Get session for response
		const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
		const session = rows[0] as unknown as SessionRow | undefined;

		// Send confirmation
		try {
			ws.send(
				JSON.stringify({
					type: "sandbox_connected",
					sessionId: session?.id || "unknown",
				} satisfies ControlPlaneToSandboxMessage),
			);
		} catch (error) {
			console.error("[SessionDO] Failed to send sandbox_connected:", error);
		}

		// Update sandbox status
		if (session) {
			console.log("[SessionDO] Updating sandbox_status to 'ready' for session:", session.id);
			this.sql.exec(
				"UPDATE session SET sandbox_status = 'ready', updated_at = ? WHERE id = ?",
				Date.now(),
				session.id,
			);

			// Broadcast state update to clients
			const state = this.getSessionState();
			console.log("[SessionDO] Broadcasting state_update, sandboxStatus:", state?.sandboxStatus, "clients:", this.clients.size);
			if (state) {
				this.broadcast({ type: "state_update", state });
			}
		} else {
			console.error("[SessionDO] No session found when sandbox connected!");
		}

		console.log("[SessionDO] Sandbox connected:", data.sandboxId);

		// Check for pending messages and send them
		this.processPendingMessages();
	}

	/**
	 * Handle messages from the connected sandbox.
	 */
	private async handleSandboxMessage(data: SandboxMessage): Promise<void> {
		switch (data.type) {
			case "event": {
				// Store event and broadcast to clients
				const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
				if (rows.length === 0) return;

				const session = rows[0] as unknown as SessionRow;

				// Store event
				this.sql.exec(
					`INSERT INTO events (id, session_id, message_id, type, data)
					 VALUES (?, ?, ?, ?, ?)`,
					data.event.id || generateId(),
					session.id,
					data.event.messageId || null,
					data.event.type,
					JSON.stringify(data.event.data),
				);

				// Update sandbox status based on event type
				if (data.event.type === "git_sync") {
					const eventData = data.event.data as { status?: string };
					// Check if this is a "ready" status from the sandbox
					if (eventData?.status === "ready") {
						console.log("[SessionDO] git_sync ready event received, setting sandbox_status to 'ready'");
						this.sql.exec(
							"UPDATE session SET sandbox_status = 'ready', updated_at = ? WHERE id = ?",
							Date.now(),
							session.id,
						);
						// Broadcast state update for ready status
						const state = this.getSessionState();
						if (state) {
							this.broadcast({ type: "state_update", state });
						}
					} else {
						// For cloning, checking_out, etc. - set to syncing
						this.sql.exec(
							"UPDATE session SET sandbox_status = 'syncing', updated_at = ? WHERE id = ?",
							Date.now(),
							session.id,
						);
					}
				}

				// Detect artifacts from tool events
				this.detectArtifactsFromEvent(session.id, data.event);

				// Track file changes from tool events
				this.trackFileChanges(session.id, data.event);

				// Broadcast to clients
				this.broadcast({ type: "event", event: data.event });
				break;
			}

			case "execution_started": {
				// Update message status
				this.sql.exec(
					"UPDATE messages SET status = 'processing' WHERE id = ?",
					data.messageId,
				);
				// Remove from pending
				this.pendingMessages.delete(data.messageId);
				break;
			}

			case "execution_complete": {
				// Update message status
				this.sql.exec(
					"UPDATE messages SET status = ?, completed_at = ? WHERE id = ?",
					data.success ? "completed" : "failed",
					Date.now(),
					data.messageId,
				);

				// Update sandbox status
				const rows = this.sql.exec("SELECT * FROM session LIMIT 1").toArray();
				if (rows.length > 0) {
					const session = rows[0] as unknown as SessionRow;
					this.sql.exec(
						"UPDATE session SET sandbox_status = 'ready', updated_at = ? WHERE id = ?",
						Date.now(),
						session.id,
					);

					// Broadcast state update
					const state = this.getSessionState();
					if (state) {
						this.broadcast({ type: "state_update", state });
					}
				}
				break;
			}

			case "pong":
				// Heartbeat response from sandbox
				break;
		}
	}

	/**
	 * Process pending messages when sandbox connects.
	 */
	private processPendingMessages(): void {
		if (this.pendingMessages.size === 0) return;

		console.log(
			"[SessionDO] Processing",
			this.pendingMessages.size,
			"pending messages",
		);

		for (const [
			messageId,
			{ content, model, author, attachments },
		] of this.pendingMessages) {
			const promptCommand: ControlPlaneToSandboxMessage = {
				type: "prompt",
				messageId,
				content,
				model,
				author,
				attachments,
			};
			if (this.sendToSandbox(promptCommand)) {
				console.log("[SessionDO] Sent pending message:", messageId);
			} else {
				console.error("[SessionDO] Failed to send pending message:", messageId);
			}
		}
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
			return Response.json({
				success: true,
				sessionId: (existing[0] as { id: string }).id,
			});
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
			const eventData = event.data as { status?: string };
			// Check if this is a "ready" status from the sandbox
			if (eventData?.status === "ready") {
				console.log("[SessionDO] git_sync ready event (HTTP), setting sandbox_status to 'ready'");
				this.sql.exec(
					"UPDATE session SET sandbox_status = 'ready', updated_at = ? WHERE id = ?",
					Date.now(),
					session.id,
				);
			} else {
				this.sql.exec(
					"UPDATE session SET sandbox_status = 'syncing', updated_at = ? WHERE id = ?",
					Date.now(),
					session.id,
				);
			}
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

		const rows = this.sql
			.exec(query, ...params)
			.toArray() as unknown as EventRow[];

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

		const rows = this.sql
			.exec(query, ...params)
			.toArray() as unknown as MessageRow[];

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
