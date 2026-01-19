import { db } from "@superset/db/client";
import { mobilePairingSessions, voiceCommands } from "@superset/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/mobile/commands?sessionId=XXX
 * Returns pending commands for a pairing session (for desktop polling).
 *
 * GET /api/mobile/commands?sessionId=XXX&history=true
 * Returns command history with responses (for mobile conversation UI).
 */
export async function GET(request: Request) {
	try {
		const { searchParams } = new URL(request.url);
		const sessionId = searchParams.get("sessionId");
		const history = searchParams.get("history") === "true";

		if (!sessionId) {
			return NextResponse.json(
				{ error: "Missing session ID" },
				{ status: 400 },
			);
		}

		// Verify the session is still valid
		const [session] = await db
			.select()
			.from(mobilePairingSessions)
			.where(
				and(
					eq(mobilePairingSessions.id, sessionId),
					eq(mobilePairingSessions.status, "paired"),
					gt(mobilePairingSessions.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (!session) {
			return NextResponse.json(
				{ error: "Invalid or expired session" },
				{ status: 401 },
			);
		}

		if (history) {
			// Return command history with responses for mobile conversation UI
			const commands = await db
				.select({
					id: voiceCommands.id,
					transcript: voiceCommands.transcript,
					targetType: voiceCommands.targetType,
					status: voiceCommands.status,
					response: voiceCommands.response,
					errorMessage: voiceCommands.errorMessage,
					createdAt: voiceCommands.createdAt,
					executedAt: voiceCommands.executedAt,
				})
				.from(voiceCommands)
				.where(eq(voiceCommands.pairingSessionId, sessionId))
				.orderBy(desc(voiceCommands.createdAt))
				.limit(50);

			return NextResponse.json({ commands });
		}

		// Get pending commands for desktop polling
		const commands = await db
			.select({
				id: voiceCommands.id,
				transcript: voiceCommands.transcript,
				targetType: voiceCommands.targetType,
				targetId: voiceCommands.targetId,
				createdAt: voiceCommands.createdAt,
			})
			.from(voiceCommands)
			.where(
				and(
					eq(voiceCommands.pairingSessionId, sessionId),
					eq(voiceCommands.status, "pending"),
				),
			)
			.orderBy(desc(voiceCommands.createdAt))
			.limit(10);

		return NextResponse.json({ commands });
	} catch (error) {
		console.error("[mobile/commands] Error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

/**
 * POST /api/mobile/commands
 * Update a command with status and/or response.
 *
 * Body: { commandId, status?, response?, error? }
 * - status: "executed" | "failed" - marks the command as completed
 * - response: string - terminal output or claude response to send back to mobile
 * - error: string - error message if command failed
 */
export async function POST(request: Request) {
	try {
		const { commandId, status, response, error } = await request.json();

		if (!commandId || typeof commandId !== "string") {
			return NextResponse.json(
				{ error: "Missing command ID" },
				{ status: 400 },
			);
		}

		// Build the update object
		const updateData: Record<string, unknown> = {};

		if (status) {
			const validStatuses = ["executed", "failed"];
			if (!validStatuses.includes(status)) {
				return NextResponse.json(
					{ error: "Invalid status. Must be 'executed' or 'failed'" },
					{ status: 400 },
				);
			}
			updateData.status = status;
			updateData.executedAt = status === "executed" ? new Date() : null;
		}

		if (response !== undefined) {
			updateData.response = response;
		}

		if (error !== undefined) {
			updateData.errorMessage = error;
		}

		if (Object.keys(updateData).length === 0) {
			return NextResponse.json(
				{ error: "No update data provided" },
				{ status: 400 },
			);
		}

		// Update the command
		const [command] = await db
			.update(voiceCommands)
			.set(updateData)
			.where(eq(voiceCommands.id, commandId))
			.returning();

		if (!command) {
			return NextResponse.json(
				{ error: "Command not found" },
				{ status: 404 },
			);
		}

		console.log("[mobile/commands] Updated command:", {
			id: command.id,
			status: command.status,
			hasResponse: !!command.response,
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("[mobile/commands] Error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
