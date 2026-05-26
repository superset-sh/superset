import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
	accessErrorResponse,
	getDurableStream,
	getOwnedChatSession,
	isOrganizationMember,
	requireAuth,
} from "../lib";

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

	// If the session already exists, the caller must own it. Otherwise the
	// caller must be a member of the org they're creating the session under,
	// so chat sessions can't be planted in arbitrary orgs.
	const existing = await getOwnedChatSession(sessionId, session.user.id);
	if (existing.kind === "forbidden") {
		return accessErrorResponse(existing);
	}
	if (existing.kind === "not-found") {
		const isMember = await isOrganizationMember(
			session.user.id,
			body.organizationId,
		);
		if (!isMember) {
			return Response.json({ error: "Not found" }, { status: 404 });
		}
	} else if (existing.row.organizationId !== body.organizationId) {
		// Owner is the caller, but they're trying to move the session to a
		// different org. Reject silently.
		return Response.json({ error: "Not found" }, { status: 404 });
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

	// onConflictDoNothing is silent when another caller raced us with the
	// same sessionId. Re-check ownership so the loser of a race gets a 404
	// instead of a 200 pointing at a row they don't own.
	const postInsert = await getOwnedChatSession(sessionId, session.user.id);
	if (postInsert.kind !== "ok") {
		return Response.json({ error: "Not found" }, { status: 404 });
	}

	if (body.workspaceId) {
		try {
			await db
				.update(chatSessions)
				.set({ workspaceId: body.workspaceId })
				.where(
					and(
						eq(chatSessions.id, sessionId),
						eq(chatSessions.createdBy, session.user.id),
						isNull(chatSessions.workspaceId),
					),
				)
				.returning({ id: chatSessions.id });
		} catch (error) {
			console.warn("[chat] failed to ensure workspace_id on session", {
				sessionId,
				workspaceId: body.workspaceId,
				error: errorMessage(error),
			});
		}
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

	const access = await getOwnedChatSession(sessionId, session.user.id);
	if (access.kind !== "ok") {
		return accessErrorResponse(access);
	}

	if (body.title !== undefined) {
		await db
			.update(chatSessions)
			.set({ title: body.title })
			.where(
				and(
					eq(chatSessions.id, sessionId),
					eq(chatSessions.createdBy, session.user.id),
				),
			);
	}

	return Response.json({ success: true }, { status: 200 });
}
