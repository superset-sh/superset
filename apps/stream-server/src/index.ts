/**
 * Durable Stream Server
 *
 * Handles real-time token streaming for AI chat sessions.
 * Provides:
 * - Stream creation and management
 * - Server-Sent Events (SSE) for live streaming
 * - Presence tracking (who's viewing, typing)
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { streamSSE } from "hono/streaming";
import {
	deleteDraft,
	getDraftStats,
	getDrafts,
	setDraft,
	subscribeToDrafts,
} from "./drafts";
import {
	getPresence,
	getPresenceStats,
	removePresence,
	setTyping,
	updatePresence,
} from "./presence";
import {
	appendEvent,
	createStream,
	deleteStream,
	getEvents,
	getStream,
	getStreamStats,
	subscribeToStream,
} from "./streams";
import type { StreamEvent } from "./types";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
	"*",
	cors({
		origin: [
			"http://localhost:3000",
			"http://localhost:5173",
			"http://localhost:5927", // Electron desktop app
			"https://app.superset.sh",
		],
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		exposeHeaders: ["X-Stream-Offset"],
	}),
);

// Health check
app.get("/health", (c) => {
	return c.json({ status: "ok", timestamp: Date.now() });
});

// Stats endpoint (for monitoring)
app.get("/stats", (c) => {
	const streamStats = getStreamStats();
	const presenceStats = getPresenceStats();
	const draftStats = getDraftStats();
	return c.json({
		...streamStats,
		presence: presenceStats,
		drafts: draftStats,
	});
});

// ============================================
// Stream Endpoints
// ============================================

/**
 * Create a new stream
 * PUT /streams/:sessionId
 */
app.put("/streams/:sessionId", async (c) => {
	const sessionId = c.req.param("sessionId");

	const stream = createStream(sessionId);
	console.log(`[stream] Created stream for session ${sessionId}`);

	return c.json({
		sessionId: stream.sessionId,
		nextOffset: stream.nextOffset,
		createdAt: stream.createdAt,
	});
});

/**
 * Append events to a stream
 * POST /streams/:sessionId
 */
app.post("/streams/:sessionId", async (c) => {
	const sessionId = c.req.param("sessionId");
	const body = await c.req.json<StreamEvent | StreamEvent[]>();

	const events = Array.isArray(body) ? body : [body];
	const results = [];

	for (const event of events) {
		const entry = appendEvent(sessionId, event);
		if (!entry) {
			return c.json({ error: "Stream not found" }, 404);
		}
		results.push(entry);
	}

	console.log(
		`[stream] Appended ${events.length} event(s) to session ${sessionId}`,
	);

	return c.json({
		appended: results.length,
		entries: results,
	});
});

/**
 * Read events from a stream
 * GET /streams/:sessionId
 *
 * Query params:
 * - offset: Start reading from this offset (default: 0)
 * - live: If "true", stream via SSE (default: false)
 */
app.get("/streams/:sessionId", async (c) => {
	const sessionId = c.req.param("sessionId");
	const offset = Number.parseInt(c.req.query("offset") || "0", 10);
	const live = c.req.query("live") === "true";

	const stream = getStream(sessionId);
	if (!stream) {
		return c.json({ error: "Stream not found" }, 404);
	}

	// Non-live: return current events and close
	if (!live) {
		const result = getEvents(sessionId, offset);
		if (!result) {
			return c.json({ error: "Stream not found" }, 404);
		}

		c.header("X-Stream-Offset", String(result.nextOffset));
		return c.json(result);
	}

	// Live mode: Server-Sent Events
	return streamSSE(c, async (stream) => {
		// First, send any existing events from offset
		const existing = getEvents(sessionId, offset);
		if (existing) {
			for (const entry of existing.events) {
				await stream.writeSSE({
					data: JSON.stringify(entry),
					event: "event",
					id: String(entry.offset),
				});
			}
		}

		// Subscribe to new events
		const unsubscribe = subscribeToStream(sessionId, async (entry) => {
			try {
				await stream.writeSSE({
					data: JSON.stringify(entry),
					event: "event",
					id: String(entry.offset),
				});
			} catch {
				// Client disconnected
				unsubscribe();
			}
		});

		// Keep connection alive with periodic heartbeats
		const heartbeatInterval = setInterval(async () => {
			try {
				await stream.writeSSE({
					data: JSON.stringify({ type: "heartbeat", timestamp: Date.now() }),
					event: "heartbeat",
				});
			} catch {
				// Client disconnected
				clearInterval(heartbeatInterval);
				unsubscribe();
			}
		}, 15_000);

		console.log(`[stream] SSE connection opened for session ${sessionId}`);

		// Keep the stream open until client disconnects
		await new Promise<void>((resolve) => {
			c.req.raw.signal.addEventListener("abort", () => {
				clearInterval(heartbeatInterval);
				unsubscribe();
				console.log(`[stream] SSE connection closed for session ${sessionId}`);
				resolve();
			});
		});
	});
});

/**
 * Delete a stream
 * DELETE /streams/:sessionId
 */
app.delete("/streams/:sessionId", async (c) => {
	const sessionId = c.req.param("sessionId");

	const deleted = deleteStream(sessionId);
	if (!deleted) {
		return c.json({ error: "Stream not found" }, 404);
	}

	console.log(`[stream] Deleted stream for session ${sessionId}`);
	return c.json({ deleted: true });
});

// ============================================
// Presence Endpoints
// ============================================

/**
 * Update presence (heartbeat)
 * POST /streams/:sessionId/presence
 */
app.post("/streams/:sessionId/presence", async (c) => {
	const sessionId = c.req.param("sessionId");
	const body = await c.req.json<{
		userId: string;
		name: string;
		isTyping?: boolean;
	}>();

	updatePresence({
		sessionId,
		userId: body.userId,
		name: body.name,
		isTyping: body.isTyping ?? false,
	});

	return c.json({ success: true });
});

/**
 * Get presence state
 * GET /streams/:sessionId/presence
 */
app.get("/streams/:sessionId/presence", async (c) => {
	const sessionId = c.req.param("sessionId");
	const presence = getPresence(sessionId);
	return c.json(presence);
});

/**
 * Set typing status
 * POST /streams/:sessionId/typing
 */
app.post("/streams/:sessionId/typing", async (c) => {
	const sessionId = c.req.param("sessionId");
	const body = await c.req.json<{
		userId: string;
		isTyping: boolean;
	}>();

	setTyping({
		sessionId,
		userId: body.userId,
		isTyping: body.isTyping,
	});

	return c.json({ success: true });
});

/**
 * Leave session (remove presence)
 * DELETE /streams/:sessionId/presence/:userId
 */
app.delete("/streams/:sessionId/presence/:userId", async (c) => {
	const sessionId = c.req.param("sessionId");
	const userId = c.req.param("userId");

	removePresence({ sessionId, userId });
	return c.json({ success: true });
});

// ============================================
// Draft Endpoints
// ============================================

/**
 * Update draft content
 * POST /streams/:sessionId/draft
 */
app.post("/streams/:sessionId/draft", async (c) => {
	const sessionId = c.req.param("sessionId");
	const body = await c.req.json<{
		userId: string;
		userName: string;
		content: string;
	}>();

	const draft = setDraft({
		sessionId,
		userId: body.userId,
		userName: body.userName,
		content: body.content,
	});

	return c.json({ success: true, draft });
});

/**
 * Get all drafts for a session
 * GET /streams/:sessionId/drafts
 *
 * Query params:
 * - excludeUserId: Filter out this user's draft
 * - live: If "true", stream via SSE (default: false)
 */
app.get("/streams/:sessionId/drafts", async (c) => {
	const sessionId = c.req.param("sessionId");
	const excludeUserId = c.req.query("excludeUserId");
	const live = c.req.query("live") === "true";

	// Non-live: return current drafts and close
	if (!live) {
		const drafts = getDrafts({ sessionId, excludeUserId });
		return c.json({ drafts });
	}

	// Live mode: Server-Sent Events
	return streamSSE(c, async (stream) => {
		// First, send any existing drafts
		const existing = getDrafts({ sessionId, excludeUserId });
		for (const draft of existing) {
			await stream.writeSSE({
				data: JSON.stringify(draft),
				event: "draft",
			});
		}

		// Subscribe to new draft updates
		const unsubscribe = subscribeToDrafts(sessionId, async (draft) => {
			// Skip excluded user's drafts
			if (excludeUserId && draft.userId === excludeUserId) {
				return;
			}

			try {
				await stream.writeSSE({
					data: JSON.stringify(draft),
					event: "draft",
				});
			} catch {
				// Client disconnected
				unsubscribe();
			}
		});

		// Keep connection alive with periodic heartbeats
		const heartbeatInterval = setInterval(async () => {
			try {
				await stream.writeSSE({
					data: JSON.stringify({ type: "heartbeat", timestamp: Date.now() }),
					event: "heartbeat",
				});
			} catch {
				// Client disconnected
				clearInterval(heartbeatInterval);
				unsubscribe();
			}
		}, 15_000);

		console.log(`[draft] SSE connection opened for session ${sessionId}`);

		// Keep the stream open until client disconnects
		await new Promise<void>((resolve) => {
			c.req.raw.signal.addEventListener("abort", () => {
				clearInterval(heartbeatInterval);
				unsubscribe();
				console.log(`[draft] SSE connection closed for session ${sessionId}`);
				resolve();
			});
		});
	});
});

/**
 * Clear a user's draft
 * DELETE /streams/:sessionId/draft/:userId
 */
app.delete("/streams/:sessionId/draft/:userId", async (c) => {
	const sessionId = c.req.param("sessionId");
	const userId = c.req.param("userId");

	deleteDraft({ sessionId, userId });
	return c.json({ success: true });
});

// Start server
const port = Number.parseInt(process.env.PORT || "8080", 10);

console.log(`[stream-server] Starting on port ${port}`);

serve({
	fetch: app.fetch,
	port,
});

export default app;
