import { db } from "@superset/db/client";
import { mobilePairingSessions } from "@superset/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	try {
		const { pairingToken } = await request.json();

		if (!pairingToken || typeof pairingToken !== "string") {
			return NextResponse.json(
				{ error: "Missing pairing token" },
				{ status: 400 },
			);
		}

		// Find the pairing session
		const [session] = await db
			.select()
			.from(mobilePairingSessions)
			.where(
				and(
					eq(mobilePairingSessions.pairingToken, pairingToken),
					eq(mobilePairingSessions.status, "pending"),
					gt(mobilePairingSessions.expiresAt, new Date()),
				),
			)
			.limit(1);

		if (!session) {
			return NextResponse.json(
				{ error: "Invalid or expired pairing token" },
				{ status: 404 },
			);
		}

		// Mark as paired
		const [updatedSession] = await db
			.update(mobilePairingSessions)
			.set({
				status: "paired",
				pairedAt: new Date(),
			})
			.where(eq(mobilePairingSessions.id, session.id))
			.returning();

		if (!updatedSession) {
			return NextResponse.json(
				{ error: "Failed to update pairing session" },
				{ status: 500 },
			);
		}

		return NextResponse.json({
			success: true,
			sessionId: updatedSession.id,
			workspaceName: updatedSession.activeWorkspaceName,
			workspaceId: updatedSession.activeWorkspaceId,
		});
	} catch (error) {
		console.error("[mobile-pair] Error:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
