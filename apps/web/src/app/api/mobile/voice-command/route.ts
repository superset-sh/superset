import { db } from "@superset/db/client";
import { mobilePairingSessions, voiceCommands } from "@superset/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

const validTargetTypes = ["terminal", "claude", "task"] as const;
type TargetType = (typeof validTargetTypes)[number];

function isValidTargetType(value: unknown): value is TargetType {
	return typeof value === "string" && validTargetTypes.includes(value as TargetType);
}

export async function POST(request: Request) {
	try {
		const { sessionId, transcript, targetType } = await request.json();

		// Validate input
		if (!sessionId || typeof sessionId !== "string") {
			return NextResponse.json(
				{ error: "Missing session ID" },
				{ status: 400 },
			);
		}

		if (!transcript || typeof transcript !== "string") {
			return NextResponse.json(
				{ error: "Missing transcript" },
				{ status: 400 },
			);
		}

		if (!isValidTargetType(targetType)) {
			return NextResponse.json(
				{ error: "Invalid target type. Must be 'terminal', 'claude', or 'task'" },
				{ status: 400 },
			);
		}

		// Find the pairing session to get user/org context
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
				{ error: "Invalid or expired session. Please scan the QR code again." },
				{ status: 401 },
			);
		}

		// Create the voice command
		const [command] = await db
			.insert(voiceCommands)
			.values({
				userId: session.userId,
				organizationId: session.organizationId,
				pairingSessionId: session.id,
				transcript: transcript.trim(),
				targetType,
				targetId: session.activeWorkspaceId,
				status: "pending",
			})
			.returning();

		if (!command) {
			return NextResponse.json(
				{ error: "Failed to create voice command" },
				{ status: 500 },
			);
		}

		console.log("[mobile/voice-command] Created command:", {
			id: command.id,
			targetType: command.targetType,
			transcript: command.transcript.substring(0, 50),
		});

		return NextResponse.json({
			success: true,
			commandId: command.id,
		});
	} catch (error) {
		console.error("[mobile/voice-command] Error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
