import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { sessionStateSchema } from "@superset/durable-session";
import { eq } from "drizzle-orm";
import { appendToStream, ensureStream, requireAuth } from "../../../lib";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const actorId = session.user.id;

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
