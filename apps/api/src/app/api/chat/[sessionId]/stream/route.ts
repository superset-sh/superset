import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import {
	PRODUCER_RESPONSE_HEADERS,
	PROTOCOL_QUERY_PARAMS,
	PROTOCOL_RESPONSE_HEADERS,
	requireAuth,
	STRIP_HEADERS,
	streamUrl,
} from "../../lib";

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
// POST — producer writes (no sub-path)
// ---------------------------------------------------------------------------

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
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
