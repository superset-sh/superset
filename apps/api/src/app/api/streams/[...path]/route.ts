import { DurableStream } from "@durable-streams/client";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { chatSessions, sessionHosts } from "@superset/db/schema";
import { sessionStateSchema } from "@superset/durable-session";
import { eq } from "drizzle-orm";
import { env } from "@/env";

const PROTOCOL_QUERY_PARAMS = ["offset", "live", "cursor"];

const PROTOCOL_RESPONSE_HEADERS = [
	"stream-next-offset",
	"stream-cursor",
	"stream-up-to-date",
	"stream-closed",
	"content-type",
	"cache-control",
	"etag",
];

const STRIP_HEADERS = new Set([
	"content-encoding",
	"content-length",
	"transfer-encoding",
]);

async function requireAuth(request: Request) {
	const sessionData = await auth.api.getSession({
		headers: request.headers,
	});
	if (!sessionData?.user) return null;
	return sessionData;
}

function streamUrl(sessionId: string) {
	return `${env.DURABLE_STREAMS_URL}/sessions/${sessionId}`;
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

async function appendToStream(sessionId: string, event: string) {
	const response = await fetch(streamUrl(sessionId), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}`,
			"Content-Type": "application/json",
		},
		body: event,
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Stream append failed: ${response.status} ${text}`);
	}
}

async function ensureStream(sessionId: string) {
	const stream = getDurableStream(sessionId);
	try {
		await stream.create({ contentType: "application/json" });
		console.log(`[streams] Created stream for session ${sessionId}`);
	} catch (err) {
		console.log(`[streams] Stream create for ${sessionId} returned:`, err);
	}
	return stream;
}

export async function GET(request: Request): Promise<Response> {
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

export async function PUT(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

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

	const stream = getDurableStream(sessionId);
	await stream.create({ contentType: "application/json" });

	await db.insert(chatSessions).values({
		id: sessionId,
		organizationId: body.organizationId,
		createdBy: session.user.id,
	});

	if (body.deviceId) {
		await db.insert(sessionHosts).values({
			sessionId,
			organizationId: body.organizationId,
			deviceId: body.deviceId,
		});
	}

	return Response.json(
		{
			sessionId,
			streamUrl: `/api/streams/v1/stream/sessions/${sessionId}`,
		},
		{ status: 200 },
	);
}

export async function POST(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "messages"
	) {
		return handleSendMessage(request, segments[2], session.user.id);
	}

	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "tool-results"
	) {
		return handleToolResult(request, segments[2], session.user.id);
	}

	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "approvals" &&
		segments[4]
	) {
		return handleApproval(request, segments[2], segments[4], session.user.id);
	}

	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "control"
	) {
		return handleControl(request, segments[2], session.user.id);
	}

	if (
		segments[0] === "v1" &&
		segments[1] === "sessions" &&
		segments[2] &&
		segments[3] === "config"
	) {
		return handleConfig(request, segments[2], session.user.id);
	}

	// Producer writes (IdempotentProducer → durable stream via proxy)
	if (
		segments[0] === "v1" &&
		segments[1] === "stream" &&
		segments[2] === "sessions" &&
		segments[3]
	) {
		return handleProducerWrite(request, segments[3]);
	}

	return new Response("Not found", { status: 404 });
}

export async function PATCH(request: Request): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const segments = parsePath(request);

	if (segments[0] !== "v1" || segments[1] !== "sessions" || !segments[2]) {
		return new Response("Not found", { status: 404 });
	}

	const sessionId = segments[2];
	const body = (await request.json()) as { title?: string };

	if (body.title !== undefined) {
		await db
			.update(chatSessions)
			.set({ title: body.title })
			.where(eq(chatSessions.id, sessionId));
	}

	return Response.json({ success: true }, { status: 200 });
}

export async function DELETE(request: Request): Promise<Response> {
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

async function handleSendMessage(
	request: Request,
	sessionId: string,
	actorId: string,
): Promise<Response> {
	const body = (await request.json()) as {
		content: string;
		messageId?: string;
		txid?: string;
	};

	if (!body.content) {
		return Response.json({ error: "content is required" }, { status: 400 });
	}

	const messageId = body.messageId ?? crypto.randomUUID();

	const message = {
		id: messageId,
		role: "user" as const,
		parts: [{ type: "text" as const, text: body.content }],
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

const PRODUCER_RESPONSE_HEADERS = [
	"stream-next-offset",
	"stream-closed",
	"producer-received-seq",
	"producer-expected-seq",
	"content-type",
];

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
