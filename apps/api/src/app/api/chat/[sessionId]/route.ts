import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { getDurableStream, requireAuth } from "../lib";

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function shouldRetryWithoutWorkspaceId(error: unknown): boolean {
	const message = errorMessage(error).toLowerCase();
	return (
		message.includes("workspace_id") ||
		message.includes("chat_sessions_workspace_id_workspaces_id_fk") ||
		message.includes("foreign key") ||
		message.includes("column") ||
		message.includes("does not exist")
	);
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
	try {
		await stream.create({ contentType: "application/json" });
	} catch (error) {
		// Idempotent: stream may already exist if caller retries.
		const message = errorMessage(error).toLowerCase();
		const isAlreadyExists =
			message.includes("already exists") || message.includes("409");
		if (!isAlreadyExists) {
			console.error("[chat] failed to create stream", {
				sessionId,
				organizationId: body.organizationId,
				error: errorMessage(error),
			});
			throw error;
		}
	}

	const baseValues = {
		id: sessionId,
		organizationId: body.organizationId,
		createdBy: session.user.id,
	};

	try {
		await db
			.insert(chatSessions)
			.values(
				body.workspaceId
					? { ...baseValues, workspaceId: body.workspaceId }
					: baseValues,
			)
			.onConflictDoNothing();
	} catch (error) {
		if (!body.workspaceId || !shouldRetryWithoutWorkspaceId(error)) {
			console.error("[chat] failed to persist chat session", {
				sessionId,
				organizationId: body.organizationId,
				workspaceId: body.workspaceId,
				error: errorMessage(error),
			});
			throw error;
		}

		console.warn("[chat] retrying chat session insert without workspaceId", {
			sessionId,
			organizationId: body.organizationId,
			workspaceId: body.workspaceId,
			error: errorMessage(error),
		});
		await db.insert(chatSessions).values(baseValues).onConflictDoNothing();
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
