import { DurableStream } from "@durable-streams/client";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { eq } from "drizzle-orm";
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

/**
 * Ensures the authenticated user has access to a specific chat session.
 * We authorize access if the user is the original creator OR if the session 
 * belongs to their current organization.
 */
export async function requireChatSessionAccess(
	sessionId: string,
	request: Request,
) {
	const sessionData = await requireAuth(request);
	if (!sessionData) return null;

	const session = await db.query.chatSessions.findFirst({
		where: eq(chatSessions.id, sessionId),
	});

	// Treat non-existent sessions as unauthorized
	if (!session) return null;

	const isCreator = session.createdBy === sessionData.user.id;
	const isOrgMember = session.organizationId === sessionData.organizationId;

	if (!isCreator && !isOrgMember) {
		// Log unauthorized attempts for security auditing
		console.warn(`[auth] Unauthorized session access attempt: user=${sessionData.user.id} session=${sessionId}`);
		return null;
	}

	return { sessionData, chatSession: session };
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
