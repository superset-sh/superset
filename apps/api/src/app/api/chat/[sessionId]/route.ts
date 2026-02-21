import { db } from "@superset/db/client";
import { chatSessions, workspaces } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { getDurableStream, requireAuth } from "../lib";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;

	const chatSession = await db.query.chatSessions.findFirst({
		where: eq(chatSessions.id, sessionId),
		columns: { workspaceId: true },
	});

	if (!chatSession?.workspaceId) {
		return Response.json({ workspacePath: null });
	}

	const workspace = await db.query.workspaces.findFirst({
		where: eq(workspaces.id, chatSession.workspaceId),
		columns: { config: true },
	});

	const path =
		workspace?.config && "path" in workspace.config
			? workspace.config.path
			: null;

	return Response.json({ workspacePath: path });
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
	const session = await requireAuth(request);
	if (!session) return new Response("Unauthorized", { status: 401 });

	const { sessionId } = await params;

	const body = (await request.json()) as {
		organizationId: string;
		workspaceId?: string;
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
		...(body.workspaceId ? { workspaceId: body.workspaceId } : {}),
	});

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
