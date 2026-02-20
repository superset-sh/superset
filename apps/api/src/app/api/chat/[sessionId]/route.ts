import { db } from "@superset/db/client";
import { chatSessions, sessionHosts } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { getDurableStream, requireAuth } from "../lib";

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;

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
			streamUrl: `/api/chat/${sessionId}/stream`,
		},
		{ status: 200 },
	);
}

export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;
	const body = (await request.json()) as { title?: string };

	if (body.title !== undefined) {
		await db
			.update(chatSessions)
			.set({ title: body.title })
			.where(eq(chatSessions.id, sessionId));
	}

	return Response.json({ success: true }, { status: 200 });
}
