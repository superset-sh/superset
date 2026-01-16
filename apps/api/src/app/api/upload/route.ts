import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members, organizations } from "@superset/db/schema";
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
	try {
		const body = (await request.json()) as HandleUploadBody;

		const jsonResponse = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (_pathname, clientPayload) => {
				// Verify user is authenticated
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session?.user) {
					throw new Error("Unauthorized");
				}

				// Parse and validate client payload
				const payload = JSON.parse(clientPayload || "{}");
				const organizationId = payload.organizationId;
				if (!organizationId) {
					throw new Error("Organization ID required");
				}

				// Verify user is a member of the organization
				const membership = await db.query.members.findFirst({
					where: and(
						eq(members.organizationId, organizationId),
						eq(members.userId, session.user.id),
					),
				});

				if (!membership) {
					throw new Error("Not a member of this organization");
				}

				// Return allowed content types and token payload
				return {
					allowedContentTypes: [
						"image/jpeg",
						"image/jpg",
						"image/png",
						"image/webp",
					],
					tokenPayload: JSON.stringify({
						organizationId,
						userId: session.user.id,
					}),
				};
			},
			onUploadCompleted: async ({ blob, tokenPayload }) => {
				// Update organization logo in database
				if (!tokenPayload) {
					console.error("[upload] Missing token payload");
					return;
				}

				const payload = JSON.parse(tokenPayload) as {
					organizationId?: string;
					userId?: string;
				};

				if (!payload.organizationId) {
					console.error("[upload] Missing organizationId in token payload");
					return;
				}

				await db
					.update(organizations)
					.set({ logo: blob.url })
					.where(eq(organizations.id, payload.organizationId));

				console.log("[upload] Organization logo updated:", {
					organizationId: payload.organizationId,
					url: blob.url,
				});
			},
		});

		return NextResponse.json(jsonResponse);
	} catch (error) {
		console.error("[upload] Upload failed:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Upload failed",
			},
			{ status: 500 },
		);
	}
}
