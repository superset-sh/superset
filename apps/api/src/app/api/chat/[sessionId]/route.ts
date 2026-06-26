import { db } from "@superset/db/client";
import { chatSessions } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { findChatSessionOwner, getDurableStream, requireAuth } from "../lib";

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function isWorkspaceFkViolation(error: unknown): boolean {
	const message = errorMessage(error).toLowerCase();
	return (
		message.includes("workspace_id") ||
		message.includes("chat_sessions_workspace_id_workspaces_id_fk") ||
		message.includes("chat_sessions_v2_workspace_id_v2_workspaces_id_fk") ||
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

	const existingOwner = await findChatSessionOwner(sessionId);
	if (existingOwner && existingOwner.createdBy !== session.user.id) {
		return new Response("Not found", { status: 404 });
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
	} catch (firstError) {
		if (!body.workspaceId || !isWorkspaceFkViolation(firstError)) {
			console.error("[chat] failed to persist chat session", {
				sessionId,
				organizationId: body.organizationId,
				workspaceId: body.workspaceId,
				error: errorMessage(firstError),
			});
			throw firstError;
		}

		// The workspaceId may be a v2 workspace — retry with v2WorkspaceId.
		try {
			await db
				.insert(chatSessions)
				.values({ ...baseValues, v2WorkspaceId: body.workspaceId })
				.onConflictDoNothing();
		} catch (secondError) {
			if (!isWorkspaceFkViolation(secondError)) {
				console.error("[chat] failed to persist chat session with v2WorkspaceId", {
					sessionId,
					organizationId: body.organizationId,
					workspaceId: body.workspaceId,
					error: errorMessage(secondError),
				});
				throw secondError;
			}
			// Neither v1 nor v2 FK matched — insert without workspace.
			console.warn("[chat] retrying chat session insert without workspaceId", {
				sessionId,
				organizationId: body.organizationId,
				workspaceId: body.workspaceId,
				error: errorMessage(secondError),
			});
			await db.insert(chatSessions).values(baseValues).onConflictDoNothing();
		}
	}

	if (body.workspaceId) {
		// Try setting as v1 workspace_id; if that FK fails, try v2_workspace_id.
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
		} catch (v1Error) {
			if (!isWorkspaceFkViolation(v1Error)) {
				console.warn("[chat] failed to ensure workspace_id on session", {
					sessionId,
					workspaceId: body.workspaceId,
					error: errorMessage(v1Error),
				});
				return Response.json({ sessionId, streamUrl: `/api/chat/${sessionId}/stream` }, { status: 200 });
			}
			try {
				await db
					.update(chatSessions)
					.set({ v2WorkspaceId: body.workspaceId })
					.where(
						and(
							eq(chatSessions.id, sessionId),
							eq(chatSessions.createdBy, session.user.id),
							isNull(chatSessions.v2WorkspaceId),
						),
					)
					.returning({ id: chatSessions.id });
			} catch (v2Error) {
				console.warn("[chat] failed to ensure v2_workspace_id on session", {
					sessionId,
					workspaceId: body.workspaceId,
					error: errorMessage(v2Error),
				});
			}
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

	if (body.title !== undefined) {
		const [updated] = await db
			.update(chatSessions)
			.set({ title: body.title })
			.where(
				and(
					eq(chatSessions.id, sessionId),
					eq(chatSessions.createdBy, session.user.id),
				),
			)
			.returning({ id: chatSessions.id });

		if (!updated) {
			return new Response("Not found", { status: 404 });
		}
	}

	return Response.json({ success: true }, { status: 200 });
}
