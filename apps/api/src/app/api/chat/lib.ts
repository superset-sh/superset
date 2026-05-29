import { DurableStream } from "@durable-streams/client";
import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import {
	chatSessions,
	members,
	type SelectChatSession,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
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

export type ChatSessionAccess =
	| { kind: "ok"; row: SelectChatSession }
	| { kind: "not-found" }
	| { kind: "forbidden" };

/**
 * Confirms the requesting user owns the chat session. Chat sessions are
 * per-user (`createdBy` is notNull and is the only identity we trust to
 * read/write the stream). We never gate solely on org membership, since
 * session IDs are exposed in URLs and can be guessed.
 */
export async function getOwnedChatSession(
	sessionId: string,
	userId: string,
): Promise<ChatSessionAccess> {
	const row = await db.query.chatSessions.findFirst({
		where: eq(chatSessions.id, sessionId),
	});
	if (!row) return { kind: "not-found" };
	if (row.createdBy !== userId) return { kind: "forbidden" };
	return { kind: "ok", row };
}

/**
 * Returns a 404 for both not-found and forbidden so unauthorized callers
 * can't probe which session IDs exist.
 */
export function accessErrorResponse(
	_access: Exclude<ChatSessionAccess, { kind: "ok" }>,
): Response {
	return Response.json({ error: "Not found" }, { status: 404 });
}

export async function isOrganizationMember(
	userId: string,
	organizationId: string,
): Promise<boolean> {
	const row = await db.query.members.findFirst({
		where: and(
			eq(members.userId, userId),
			eq(members.organizationId, organizationId),
		),
		columns: { id: true },
	});
	return Boolean(row);
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
