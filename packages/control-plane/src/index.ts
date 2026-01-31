/**
 * Superset Control Plane
 *
 * Cloudflare Workers-based control plane for managing cloud workspace sessions.
 * Coordinates between clients (web/desktop) and Modal sandboxes.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { SessionDO } from "./session";
import { createModalClient } from "./sandbox/client";
import { verifyInternalToken, generateSandboxToken, hashToken } from "./auth";
import { generateId } from "./session/schema";
import type { Env } from "./types";

// Re-export the Durable Object class for wrangler
export { SessionDO } from "./session";

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use(
	"*",
	cors({
		origin: (origin) => {
			// Allow requests from our domains and localhost
			if (!origin) return "*";
			if (origin.includes("superset.sh")) return origin;
			if (origin.includes("localhost")) return origin;
			return null;
		},
		allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
		credentials: true,
	}),
);

// Health check
app.get("/health", (c) => {
	return c.json({ status: "ok", service: "superset-control-plane" });
});

/**
 * Create a new session.
 * Called by the web/desktop app when starting a cloud workspace.
 */
app.post("/api/sessions", async (c) => {
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.json<{
		organizationId: string;
		userId: string;
		repoOwner: string;
		repoName: string;
		branch: string;
		baseBranch?: string;
		model?: string;
	}>();

	// Generate session ID
	const sessionId = generateId();

	// Get the Durable Object stub
	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	// Initialize the session in the Durable Object
	const initResponse = await stub.fetch(
		new Request("https://internal/internal/init", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId,
				organizationId: body.organizationId,
				userId: body.userId,
				repoOwner: body.repoOwner,
				repoName: body.repoName,
				branch: body.branch,
				baseBranch: body.baseBranch || "main",
				model: body.model,
			}),
		}),
	);

	if (!initResponse.ok) {
		const error = await initResponse.text();
		console.error("[control-plane] Failed to initialize session:", error);
		return c.json({ error: "Failed to create session" }, 500);
	}

	// Generate sandbox auth token
	const sandboxToken = generateSandboxToken();
	const sandboxTokenHash = await hashToken(sandboxToken);

	// Store token hash in KV for later verification
	await c.env.SESSION_TOKENS.put(`session:${sessionId}:sandbox_token`, sandboxTokenHash, {
		expirationTtl: 86400 * 7, // 7 days
	});

	return c.json({
		success: true,
		sessionId,
		sandboxToken,
	});
});

/**
 * Get session state.
 */
app.get("/api/sessions/:sessionId", async (c) => {
	const sessionId = c.req.param("sessionId");

	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const response = await stub.fetch(new Request("https://internal/internal/state"));

	if (!response.ok) {
		return c.json({ error: "Session not found" }, 404);
	}

	const state = await response.json();
	return c.json(state);
});

/**
 * Send a prompt to a session.
 */
app.post("/api/sessions/:sessionId/prompt", async (c) => {
	const sessionId = c.req.param("sessionId");
	const body = await c.req.json<{
		content: string;
		authorId: string;
		participantId?: string;
	}>();

	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const response = await stub.fetch(
		new Request("https://internal/internal/prompt", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);

	if (!response.ok) {
		return c.json({ error: "Failed to send prompt" }, 500);
	}

	const result = await response.json();
	return c.json(result);
});

/**
 * Stop session execution.
 */
app.post("/api/sessions/:sessionId/stop", async (c) => {
	const sessionId = c.req.param("sessionId");

	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const response = await stub.fetch(
		new Request("https://internal/internal/stop", {
			method: "POST",
		}),
	);

	if (!response.ok) {
		return c.json({ error: "Failed to stop session" }, 500);
	}

	return c.json({ success: true });
});

/**
 * Archive a session.
 */
app.post("/api/sessions/:sessionId/archive", async (c) => {
	const sessionId = c.req.param("sessionId");

	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const response = await stub.fetch(
		new Request("https://internal/internal/archive", {
			method: "POST",
		}),
	);

	if (!response.ok) {
		return c.json({ error: "Failed to archive session" }, 500);
	}

	return c.json({ success: true });
});

/**
 * WebSocket upgrade for real-time session updates.
 */
app.get("/api/sessions/:sessionId/ws", async (c) => {
	const sessionId = c.req.param("sessionId");

	// Forward the WebSocket upgrade to the Durable Object
	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	return stub.fetch(c.req.raw);
});

/**
 * Get session events.
 */
app.get("/api/sessions/:sessionId/events", async (c) => {
	const sessionId = c.req.param("sessionId");
	const type = c.req.query("type");
	const limit = c.req.query("limit") || "100";
	const offset = c.req.query("offset") || "0";

	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const url = new URL("https://internal/internal/events");
	if (type) url.searchParams.set("type", type);
	url.searchParams.set("limit", limit);
	url.searchParams.set("offset", offset);

	const response = await stub.fetch(new Request(url.toString()));

	if (!response.ok) {
		return c.json({ error: "Failed to get events" }, 500);
	}

	const result = await response.json();
	return c.json(result);
});

/**
 * Get session messages.
 */
app.get("/api/sessions/:sessionId/messages", async (c) => {
	const sessionId = c.req.param("sessionId");
	const status = c.req.query("status");
	const limit = c.req.query("limit") || "100";
	const offset = c.req.query("offset") || "0";

	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const url = new URL("https://internal/internal/messages");
	if (status) url.searchParams.set("status", status);
	url.searchParams.set("limit", limit);
	url.searchParams.set("offset", offset);

	const response = await stub.fetch(new Request(url.toString()));

	if (!response.ok) {
		return c.json({ error: "Failed to get messages" }, 500);
	}

	const result = await response.json();
	return c.json(result);
});

/**
 * Internal endpoint for sandbox events.
 * Called by Modal sandboxes to report events back to the control plane.
 */
app.post("/internal/sandbox-event", async (c) => {
	// Verify internal token
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const token = authHeader.slice(7);
	const isValid = await verifyInternalToken(token, c.env.MODAL_API_SECRET);
	if (!isValid) {
		return c.json({ error: "Invalid token" }, 401);
	}

	const body = await c.req.json<{
		sessionId: string;
		event: {
			id?: string;
			type: string;
			messageId?: string;
			data: Record<string, unknown>;
		};
	}>();

	const doId = c.env.SESSION_DO.idFromName(body.sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const response = await stub.fetch(
		new Request("https://internal/internal/sandbox-event", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body.event),
		}),
	);

	if (!response.ok) {
		return c.json({ error: "Failed to process event" }, 500);
	}

	return c.json({ success: true });
});

/**
 * Spawn a sandbox for a session.
 * Called when a session needs to start executing.
 */
app.post("/api/sessions/:sessionId/spawn-sandbox", async (c) => {
	const sessionId = c.req.param("sessionId");

	// Get session state
	const doId = c.env.SESSION_DO.idFromName(sessionId);
	const stub = c.env.SESSION_DO.get(doId);

	const stateResponse = await stub.fetch(new Request("https://internal/internal/state"));
	if (!stateResponse.ok) {
		return c.json({ error: "Session not found" }, 404);
	}

	const state = (await stateResponse.json()) as {
		sessionId: string;
		repoOwner: string;
		repoName: string;
		branch: string;
		baseBranch: string;
		model?: string;
	};

	// Get sandbox token from KV
	const sandboxTokenHash = await c.env.SESSION_TOKENS.get(`session:${sessionId}:sandbox_token`);
	if (!sandboxTokenHash) {
		return c.json({ error: "Session token not found" }, 404);
	}

	// Generate a new sandbox token for this spawn
	const sandboxToken = generateSandboxToken();

	// Create Modal client and spawn sandbox
	const modalClient = createModalClient(c.env.MODAL_API_SECRET, c.env.MODAL_WORKSPACE);

	try {
		const result = await modalClient.createSandbox({
			sessionId,
			repoOwner: state.repoOwner,
			repoName: state.repoName,
			branch: state.branch,
			baseBranch: state.baseBranch,
			controlPlaneUrl: c.env.CONTROL_PLANE_URL,
			sandboxAuthToken: sandboxToken,
			model: state.model,
		});

		return c.json({
			success: true,
			sandboxId: result.sandboxId,
			status: result.status,
		});
	} catch (error) {
		console.error("[control-plane] Failed to spawn sandbox:", error);
		return c.json({ error: "Failed to spawn sandbox" }, 500);
	}
});

/**
 * Terminate a sandbox.
 */
app.post("/api/sessions/:sessionId/terminate-sandbox", async (c) => {
	const sessionId = c.req.param("sessionId");
	const body = await c.req.json<{ sandboxId: string }>();

	const modalClient = createModalClient(c.env.MODAL_API_SECRET, c.env.MODAL_WORKSPACE);

	try {
		await modalClient.terminateSandbox(body.sandboxId);
		return c.json({ success: true });
	} catch (error) {
		console.error("[control-plane] Failed to terminate sandbox:", error);
		return c.json({ error: "Failed to terminate sandbox" }, 500);
	}
});

export default app;
