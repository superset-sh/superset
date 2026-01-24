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
	appendEvent,
	createStream,
	deleteStream,
	getEvents,
	getStream,
	getStreamStats,
	subscribeToStream,
} from "./streams";
import { getPresence, getPresenceStats, removePresence, setTyping, updatePresence } from "./presence";
import type { StreamEvent } from "./types";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
	"*",
	cors({
		origin: ["http://localhost:3000", "http://localhost:5173", "https://app.superset.sh"],
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
	return c.json({
		...streamStats,
		presence: presenceStats,
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

	console.log(`[stream] Appended ${events.length} event(s) to session ${sessionId}`);

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

		// Handle abort
		c.req.raw.signal.addEventListener("abort", () => {
			clearInterval(heartbeatInterval);
			unsubscribe();
			console.log(`[stream] SSE connection closed for session ${sessionId}`);
		});

		console.log(`[stream] SSE connection opened for session ${sessionId}`);
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

// Start server
const port = Number.parseInt(process.env.PORT || "8080", 10);

console.log(`[stream-server] Starting on port ${port}`);

serve({
	fetch: app.fetch,
	port,
});

export default app;
