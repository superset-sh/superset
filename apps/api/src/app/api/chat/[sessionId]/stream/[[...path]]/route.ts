import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { sessionStateSchema } from "@superset/durable-session";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import {
	appendToStream,
	ensureStream,
	PRODUCER_RESPONSE_HEADERS,
	PROTOCOL_QUERY_PARAMS,
	PROTOCOL_RESPONSE_HEADERS,
	requireAuth,
	STRIP_HEADERS,
	streamUrl,
} from "../../../lib";

/**
 * Parse the catch-all path segments from the URL.
 * e.g. /api/chat/{id}/stream/messages → ["messages"]
 *      /api/chat/{id}/stream/approvals/abc → ["approvals", "abc"]
 *      /api/chat/{id}/stream → [] (no sub-path)
 */
function parseSubPath(request: Request): string[] {
	const url = new URL(request.url);
	// Match /stream at the end or /stream/ followed by more segments
	const match = url.pathname.match(/\/stream(?:\/(.*))?$/);
	if (!match) return [];
	const rest = match[1] ?? "";
	return rest.split("/").filter(Boolean);
}

// ---------------------------------------------------------------------------
// GET — SSE proxy (read from durable stream)
// ---------------------------------------------------------------------------

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const url = new URL(request.url);

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

	if (response.status === 204) {
		const headers = new Headers();
		for (const h of PROTOCOL_RESPONSE_HEADERS) {
			const v = response.headers.get(h);
			if (v) headers.set(h, v);
		}
		return new Response(null, { status: 204, headers });
	}

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
// POST — messages, tool-results, approvals, control, config, producer writes
// ---------------------------------------------------------------------------

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const subPath = parseSubPath(request);

	// POST /api/chat/{id}/stream/messages
	if (subPath[0] === "messages" && subPath.length === 1) {
		return handleSendMessage(request, sessionId, session.user.id);
	}

	// POST /api/chat/{id}/stream/tool-results
	if (subPath[0] === "tool-results" && subPath.length === 1) {
		return handleToolResult(request, sessionId, session.user.id);
	}

	// POST /api/chat/{id}/stream/approvals/{approvalId}
	if (subPath[0] === "approvals" && subPath[1]) {
		return handleApproval(request, sessionId, subPath[1], session.user.id);
	}

	// POST /api/chat/{id}/stream/control
	if (subPath[0] === "control" && subPath.length === 1) {
		return handleControl(request, sessionId, session.user.id);
	}

	// POST /api/chat/{id}/stream/config
	if (subPath[0] === "config" && subPath.length === 1) {
		return handleConfig(request, sessionId, session.user.id);
	}

	// POST /api/chat/{id}/stream (no sub-path) — producer writes
	if (subPath.length === 0) {
		return handleProducerWrite(request, sessionId);
	}

	return new Response("Not found", { status: 404 });
}

// ---------------------------------------------------------------------------
// DELETE — delete stream + DB row
// ---------------------------------------------------------------------------

export async function DELETE(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;

	const response = await fetch(streamUrl(sessionId), {
		method: "DELETE",
		headers: {
			Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}`,
		},
	});

	await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));

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
// HEAD — head check on stream
// ---------------------------------------------------------------------------

export async function HEAD(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;

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
// POST sub-handlers
// ---------------------------------------------------------------------------

async function handleSendMessage(
	request: Request,
	sessionId: string,
	actorId: string,
): Promise<Response> {
	const body = (await request.json()) as {
		content?: string;
		messageId?: string;
		txid?: string;
		files?: Array<{ url: string; mediaType: string; filename?: string }>;
	};

	if (!body.content && (!body.files || body.files.length === 0)) {
		return Response.json(
			{ error: "content or files is required" },
			{ status: 400 },
		);
	}

	const messageId = body.messageId ?? crypto.randomUUID();

	const parts: Array<
		| { type: "text"; text: string }
		| { type: "file"; url: string; mediaType: string; filename?: string }
	> = [];

	if (body.content) {
		parts.push({ type: "text", text: body.content });
	}

	if (body.files) {
		for (const file of body.files) {
			parts.push({
				type: "file",
				url: file.url,
				mediaType: file.mediaType,
				...(file.filename ? { filename: file.filename } : {}),
			});
		}
	}

	const message = {
		id: messageId,
		role: "user" as const,
		parts,
		createdAt: new Date().toISOString(),
	};

	const eventHeaders = body.txid ? { txid: body.txid } : undefined;

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
		...(eventHeaders ? { headers: eventHeaders } : {}),
	});

	await ensureStream(sessionId);
	await appendToStream(sessionId, JSON.stringify(event));

	await db
		.update(chatSessions)
		.set({ lastActiveAt: new Date() })
		.where(eq(chatSessions.id, sessionId));

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
		return Response.json({ error: "toolCallId is required" }, { status: 400 });
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

	await appendToStream(sessionId, JSON.stringify(event));

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

	await appendToStream(sessionId, JSON.stringify(event));

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

	await appendToStream(sessionId, JSON.stringify(event));

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
		availableModels?: Array<{ id: string; name: string; provider: string }>;
		slashCommands?: Array<{
			name: string;
			description: string;
			argumentHint: string;
		}>;
		title?: string;
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

	await appendToStream(sessionId, JSON.stringify(event));

	return Response.json({ success: true }, { status: 200 });
}

async function handleProducerWrite(
	request: Request,
	sessionId: string,
): Promise<Response> {
	const upstream = streamUrl(sessionId);

	const headers: Record<string, string> = {
		Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}`,
		"Content-Type": request.headers.get("content-type") ?? "application/json",
	};
	for (const h of [
		"producer-id",
		"producer-epoch",
		"producer-seq",
		"stream-closed",
	]) {
		const v = request.headers.get(h);
		if (v) headers[h] = v;
	}

	const body = await request.arrayBuffer();

	const response = await fetch(upstream, {
		method: "POST",
		headers,
		body,
	});

	const respHeaders = new Headers();
	for (const h of PRODUCER_RESPONSE_HEADERS) {
		const v = response.headers.get(h);
		if (v) respHeaders.set(h, v);
	}

	if (response.status === 204) {
		return new Response(null, { status: 204, headers: respHeaders });
	}

	const respBody = await response.arrayBuffer();
	return new Response(respBody, {
		status: response.status,
		headers: respHeaders,
	});
}
