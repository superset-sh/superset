import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { mobilePairingSessions, voiceCommands } from "@superset/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";

/**
 * Mobile Relay API
 *
 * This endpoint handles the relay of commands between mobile and desktop.
 * Uses Server-Sent Events (SSE) for desktop to receive commands,
 * and POST for mobile to send commands.
 *
 * In the future, this can be upgraded to WebSockets for bidirectional communication.
 */

// In-memory store for pending commands (in production, use Redis)
const pendingCommands = new Map<
	string,
	Array<{
		id: string;
		transcript: string;
		targetType: string;
		targetId: string | null;
		createdAt: Date;
	}>
>();

// In-memory store for desktop connections
const desktopConnections = new Map<string, ReadableStreamController<Uint8Array>>();

/**
 * GET - Desktop subscribes to receive commands via SSE
 *
 * Query params:
 * - sessionId: The pairing session ID
 */
export async function GET(request: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	const url = new URL(request.url);
	const sessionId = url.searchParams.get("sessionId");

	if (!sessionId) {
		return new Response("Missing sessionId", { status: 400 });
	}

	// Verify the pairing session belongs to this user
	const [pairingSession] = await db
		.select()
		.from(mobilePairingSessions)
		.where(
			and(
				eq(mobilePairingSessions.id, sessionId),
				eq(mobilePairingSessions.userId, session.user.id),
				eq(mobilePairingSessions.status, "paired"),
			),
		)
		.limit(1);

	if (!pairingSession) {
		return new Response("Session not found", { status: 404 });
	}

	// Create SSE stream
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			// Store the controller for this session
			desktopConnections.set(sessionId, controller);

			// Send initial connection message
			controller.enqueue(
				encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`),
			);

			// Send any pending commands
			const pending = pendingCommands.get(sessionId) ?? [];
			for (const cmd of pending) {
				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({
							type: "command",
							...cmd,
						})}\n\n`,
					),
				);
			}
			pendingCommands.delete(sessionId);
		},
		cancel() {
			desktopConnections.delete(sessionId);
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
}

/**
 * POST - Mobile sends a command to relay to desktop
 *
 * Body:
 * - sessionId: The pairing session ID
 * - commandId: The voice command ID
 */
export async function POST(request: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = await request.json();
	const { sessionId, commandId } = body;

	if (!sessionId || !commandId) {
		return new Response("Missing sessionId or commandId", { status: 400 });
	}

	// Get the voice command
	const [command] = await db
		.select()
		.from(voiceCommands)
		.where(
			and(
				eq(voiceCommands.id, commandId),
				eq(voiceCommands.userId, session.user.id),
			),
		)
		.limit(1);

	if (!command) {
		return new Response("Command not found", { status: 404 });
	}

	// Verify the pairing session
	const [pairingSession] = await db
		.select()
		.from(mobilePairingSessions)
		.where(
			and(
				eq(mobilePairingSessions.id, sessionId),
				eq(mobilePairingSessions.userId, session.user.id),
				eq(mobilePairingSessions.status, "paired"),
			),
		)
		.limit(1);

	if (!pairingSession) {
		return new Response("Session not found", { status: 404 });
	}

	// Check if desktop is connected
	const desktopController = desktopConnections.get(sessionId);

	const commandPayload = {
		id: command.id,
		transcript: command.transcript,
		targetType: command.targetType,
		targetId: command.targetId,
		createdAt: command.createdAt,
	};

	if (desktopController) {
		// Send directly to connected desktop
		try {
			const encoder = new TextEncoder();
			desktopController.enqueue(
				encoder.encode(
					`data: ${JSON.stringify({
						type: "command",
						...commandPayload,
					})}\n\n`,
				),
			);

			// Update command status to sent
			await db
				.update(voiceCommands)
				.set({ status: "sent" })
				.where(eq(voiceCommands.id, commandId));

			return Response.json({ status: "sent" });
		} catch {
			// Desktop disconnected, fall through to queue
			desktopConnections.delete(sessionId);
		}
	}

	// Queue the command for when desktop reconnects
	const pending = pendingCommands.get(sessionId) ?? [];
	pending.push(commandPayload);
	pendingCommands.set(sessionId, pending);

	return Response.json({ status: "queued" });
}

/**
 * DELETE - Desktop acknowledges a command was executed
 *
 * Body:
 * - commandId: The voice command ID
 * - success: Whether execution succeeded
 * - error: Optional error message
 */
export async function DELETE(request: Request) {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return new Response("Unauthorized", { status: 401 });
	}

	const body = await request.json();
	const { commandId, success, error } = body;

	if (!commandId) {
		return new Response("Missing commandId", { status: 400 });
	}

	// Update command status
	await db
		.update(voiceCommands)
		.set({
			status: success ? "executed" : "failed",
			errorMessage: error ?? null,
			executedAt: success ? new Date() : null,
		})
		.where(
			and(
				eq(voiceCommands.id, commandId),
				eq(voiceCommands.userId, session.user.id),
			),
		);

	return Response.json({ success: true });
}
