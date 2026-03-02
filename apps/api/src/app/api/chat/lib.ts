import { DurableStream } from "@durable-streams/client";
import { auth } from "@superset/auth/server";
import { env } from "@/env";

export const PROTOCOL_QUERY_PARAMS = ["offset", "live", "cursor"];

export const PROTOCOL_RESPONSE_HEADERS = [
	"stream-next-offset",
	"stream-cursor",
	"stream-up-to-date",
	"stream-closed",
	"content-type",
	"cache-control",
	"etag",
];

export const STRIP_HEADERS = new Set([
	"content-encoding",
	"content-length",
	"transfer-encoding",
]);

export const PRODUCER_RESPONSE_HEADERS = [
	"stream-next-offset",
	"stream-closed",
	"producer-received-seq",
	"producer-expected-seq",
	"content-type",
];

export async function requireAuth(request: Request) {
	const sessionData = await auth.api.getSession({
		headers: request.headers,
	});
	if (!sessionData?.user) return null;
	return sessionData;
}

export function streamUrl(sessionId: string) {
	return `${env.DURABLE_STREAMS_URL}/sessions/${sessionId}`;
}

export function getDurableStream(sessionId: string) {
	return new DurableStream({
		url: streamUrl(sessionId),
		headers: { Authorization: `Bearer ${env.DURABLE_STREAMS_SECRET}` },
	});
}

export async function appendToStream(sessionId: string, event: string) {
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

export async function ensureStream(sessionId: string) {
	const stream = getDurableStream(sessionId);
	try {
		await stream.create({ contentType: "application/json" });
		console.log(`[streams] Created stream for session ${sessionId}`);
	} catch (err) {
		console.log(`[streams] Stream create for ${sessionId} returned:`, err);
	}
	return stream;
}
