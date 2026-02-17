/**
 * Durable Streams proxy — follows the @electric-sql/durable-session-proxy pattern.
 *
 * Reads (GET) are proxied directly to the hosted Durable Streams service.
 * Writes go through REST endpoints that use DurableStream + sessionStateSchema
 * to write STATE-PROTOCOL events.
 *
 * Postgres side-effects: session_hosts rows are created/deleted alongside
 * durable stream operations for Electric-powered session discovery.
 *
 * Routes:
 *   GET    /api/streams/v1/stream/sessions/:id            — SSE proxy (reads)
 *   PUT    /api/streams/v1/sessions/:id                   — Create session + host row
 *   POST   /api/streams/v1/sessions/:id/messages          — Send user message
 *   POST   /api/streams/v1/sessions/:id/tool-results      — Send tool results
 *   POST   /api/streams/v1/sessions/:id/approvals/:aid    — Approve/decline tool
 *   POST   /api/streams/v1/sessions/:id/control           — Control events (abort)
 *   POST   /api/streams/v1/sessions/:id/config            — Config events (model, cwd, etc.)
 *   DELETE /api/streams/v1/stream/sessions/:id            — Delete stream + host row
 *   HEAD   /api/streams/v1/stream/sessions/:id            — Proxy HEAD
 */

import { DurableStream } from "@durable-streams/client";
import { sessionStateSchema } from "@superset/durable-session";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { sessionHosts } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/env";

// Durable Streams protocol query params to forward on reads
const PROTOCOL_QUERY_PARAMS = ["offset", "live", "cursor"];

// Protocol response headers to pass through
const PROTOCOL_RESPONSE_HEADERS = [
	"stream-next-offset",
	"stream-cursor",
	"stream-up-to-date",
	"stream-closed",
	"content-type",
	"cache-control",
	"etag",
];

// Headers to strip from proxied responses (Next.js re-encodes)
const STRIP_HEADERS = new Set([
	"content-encoding",
	"content-length",
	"transfer-encoding",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAuth(request: Request) {
	const sessionData = await auth.api.getSession({
		headers: request.headers,
	});
	if (!sessionData?.user) return null;
	return sessionData;
}

function streamUrl(sessionId: string) {
	return `${env.DURABLE_STREAMS_URL}/v1/stream/sessions/${sessionId}`;
}

function parsePath(request: Request): string[] {
	const url = new URL(request.url);
	const prefix = "/api/streams/";
	const idx = url.pathname.indexOf(prefix);
	const rest = idx !== -1 ? url.pathname.slice(idx + prefix.length) : "";
	return rest.split("/").filter(Boolean);
}

function getDurableStream(sessionId: string) {
	return new DurableStream({
		url: streamUrl(sessionId),
		headers: { Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}` },
	});
}

// ---------------------------------------------------------------------------
// GET — Proxy SSE reads to hosted Durable Streams
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

	// Expected: v1/stream/sessions/:sessionId
	if (
		segments[0] !== "v1" ||
		segments[1] !== "stream" ||
		segments[2] !== "sessions" ||
		!segments[3]
	) {
		return new Response("Not found", { status: 404 });
	}

	const sessionId = segments[3];
	const url = new URL(request.url);

	// Build upstream URL with protocol query params only
	const upstream = new URL(streamUrl(sessionId));
	for (const param of PROTOCOL_QUERY_PARAMS) {
		const value = url.searchParams.get(param);
		if (value !== null) upstream.searchParams.set(param, value);
	}

	const response = await fetch(upstream.toString(), {
		method: "GET",
		headers: {
			Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}`,
			Accept: request.headers.get("accept") ?? "*/*",
		},
	});

	if (!response.ok) {
		if (response.status === 404) {
			return Response.json({ error: "Stream not found" }, { status: 404 });
		}
		const text = await response.text().catch(() => "Unknown error");
		return Response.json(
			{ error: "Upstream error", status: response.status, details: text },
			{ status: response.status as 400 },
		);
	}

	// 204 No Content (long-poll timeout)
	if (response.status === 204) {
		const headers = new Headers();
		for (const h of PROTOCOL_RESPONSE_HEADERS) {
			const v = response.headers.get(h);
			if (v) headers.set(h, v);
		}
		return new Response(null, { status: 204, headers });
	}

	// Stream response through with protocol headers
	const headers = new Headers();
	for (const h of PROTOCOL_RESPONSE_HEADERS) {
		const v = response.headers.get(h);
		if (v) headers.set(h, v);
	}

	return new Response(response.body, {
		status: response.status,
		headers,
	});
}

// ---------------------------------------------------------------------------
// PUT — Create session (DurableStream.create + session_hosts row)
// ---------------------------------------------------------------------------

export async function PUT(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

	// Expected: v1/sessions/:sessionId
	if (segments[0] !== "v1" || segments[1] !== "sessions" || !segments[2]) {
		return new Response("Not found", { status: 404 });
	}

	const sessionId = segments[2];
	const body = (await request.json()) as {
		organizationId: string;
		deviceId?: string;
	};

	if (!body.organizationId) {
		return Response.json(
			{ error: "organizationId is required" },
			{ status: 400 },
		);
	}

	// Create durable stream
	const stream = getDurableStream(sessionId);
	await stream.create({ contentType: "application/json" });

	// Insert session_hosts row for Electric discovery
	await db.insert(sessionHosts).values({
		id: sessionId,
		organizationId: body.organizationId,
		createdBy: session.user.id,
		deviceId: body.deviceId ?? null,
	});

	return Response.json(
		{
			sessionId,
			streamUrl: `/api/streams/v1/stream/sessions/${sessionId}`,
		},
		{ status: 200 },
	);
}

// ---------------------------------------------------------------------------
// POST — Send user message / tool results / approvals / control / config
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

	// v1/sessions/:sessionId/messages
	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "messages"
	) {
		return handleSendMessage(request, segments[2], session.user.id);
	}

	// v1/sessions/:sessionId/tool-results
	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "tool-results"
	) {
		return handleToolResult(request, segments[2], session.user.id);
	}

	// v1/sessions/:sessionId/approvals/:approvalId
	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "approvals" &&
		segments[4]
	) {
		return handleApproval(request, segments[2], segments[4], session.user.id);
	}

	// v1/sessions/:sessionId/control
	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "control"
	) {
		return handleControl(request, segments[2], session.user.id);
	}

	// v1/sessions/:sessionId/config
	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "config"
	) {
		return handleConfig(request, segments[2], session.user.id);
	}

	return new Response("Not found", { status: 404 });
}

// ---------------------------------------------------------------------------
// DELETE — Delete stream + session_hosts row
// ---------------------------------------------------------------------------

export async function DELETE(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

	// v1/stream/sessions/:id
	if (
		segments[0] !== "v1" ||
		segments[1] !== "stream" ||
		segments[2] !== "sessions" ||
		!segments[3]
	) {
		return new Response("Not found", { status: 404 });
	}

	const sessionId = segments[3];

	// Delete durable stream
	const response = await fetch(streamUrl(sessionId), {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}`,
		},
	});

	// Delete session_hosts row
	await db.delete(sessionHosts).where(eq(sessionHosts.id, sessionId));

	const headers = new Headers();
	for (const [key, value] of response.headers.entries()) {
		if (!STRIP_HEADERS.has(key.toLowerCase())) {
			headers.set(key, value);
		}
	}

	return new Response(response.body, {
		status: response.status,
		headers,
	});
}

// ---------------------------------------------------------------------------
// HEAD — Proxy to hosted Durable Streams
// ---------------------------------------------------------------------------

export async function HEAD(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

	if (
		segments[0] !== "v1" ||
		segments[1] !== "stream" ||
		segments[2] !== "sessions" ||
		!segments[3]
	) {
		return new Response("Not found", { status: 404 });
	}

	const sessionId = segments[3];
	const response = await fetch(streamUrl(sessionId), {
		method: "HEAD",
		headers: {
			Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}`,
		},
	});

	const headers = new Headers();
	for (const [key, value] of response.headers.entries()) {
		if (!STRIP_HEADERS.has(key.toLowerCase())) {
			headers.set(key, value);
		}
	}

	return new Response(response.body, {
		status: response.status,
		headers,
	});
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleSendMessage(
	request: Request,
	sessionId: string,
	actorId: string,
): Promise<Response> {
	const body = (await request.json()) as {
		content: string;
		messageId?: string;
	};

	if (!body.content) {
		return Response.json({ error: "content is required" }, { status: 400 });
	}

	const messageId = body.messageId ?? crypto.randomUUID();

	// Write user message as STATE-PROTOCOL chunk event
	const message = {
		id: messageId,
		role: "user" as const,
		parts: [{ type: "text" as const, content: body.content }],
		createdAt: new Date().toISOString(),
	};

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({ type: "whole-message", message }),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	const stream = getDurableStream(sessionId);
	await stream.append(JSON.stringify(event));

	// Update last_active_at
	await db
		.update(sessionHosts)
		.set({ lastActiveAt: new Date() })
		.where(eq(sessionHosts.id, sessionId));

	return Response.json({ messageId }, { status: 200 });
}

async function handleToolResult(
	request: Request,
	sessionId: string,
	actorId: string,
): Promise<Response> {
	const body = (await request.json()) as {
		toolCallId: string;
		output: unknown;
		error?: string | null;
		messageId?: string;
	};

	if (!body.toolCallId) {
		return Response.json(
			{ error: "toolCallId is required" },
			{ status: 400 },
		);
	}

	const messageId = body.messageId ?? crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "tool-result",
				toolCallId: body.toolCallId,
				output: body.output,
				error: body.error ?? null,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	const stream = getDurableStream(sessionId);
	await stream.append(JSON.stringify(event));

	return Response.json({ messageId }, { status: 200 });
}

async function handleApproval(
	request: Request,
	sessionId: string,
	approvalId: string,
	actorId: string,
): Promise<Response> {
	const body = (await request.json()) as { approved: boolean };

	if (typeof body.approved !== "boolean") {
		return Response.json({ error: "approved is required" }, { status: 400 });
	}

	const messageId = crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "approval-response",
				approvalId,
				approved: body.approved,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	const stream = getDurableStream(sessionId);
	await stream.append(JSON.stringify(event));

	return Response.json({ messageId }, { status: 200 });
}

async function handleControl(
	request: Request,
	sessionId: string,
	actorId: string,
): Promise<Response> {
	const body = (await request.json()) as { action: string };

	if (!body.action) {
		return Response.json({ error: "action is required" }, { status: 400 });
	}

	const messageId = crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "control",
				action: body.action,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	const stream = getDurableStream(sessionId);
	await stream.append(JSON.stringify(event));

	return Response.json({ success: true }, { status: 200 });
}

async function handleConfig(
	request: Request,
	sessionId: string,
	actorId: string,
): Promise<Response> {
	const body = (await request.json()) as {
		model?: string;
		permissionMode?: string;
		thinkingEnabled?: boolean;
		cwd?: string;
	};

	const messageId = crypto.randomUUID();

	const event = sessionStateSchema.chunks.insert({
		key: `${messageId}:0`,
		value: {
			messageId,
			actorId,
			role: "user",
			chunk: JSON.stringify({
				type: "config",
				...body,
			}),
			seq: 0,
			createdAt: new Date().toISOString(),
		},
	});

	const stream = getDurableStream(sessionId);
	await stream.append(JSON.stringify(event));

	return Response.json({ success: true }, { status: 200 });
}
