import { auth } from "@clerk/nextjs/server";
import { db } from "@superset/db/client";
import { organizationMembers, users } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";

/**
 * Initiate Linear OAuth flow
 *
 * GET /api/integrations/linear/connect?organizationId=<uuid>
 *
 * Requires authenticated user who is a member of the organization.
 * Redirects to Linear's OAuth authorization page.
 */
export async function GET(request: Request) {
	const { userId: clerkUserId } = await auth();

	if (!clerkUserId) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const organizationId = url.searchParams.get("organizationId");

	if (!organizationId) {
		return Response.json(
			{ error: "Missing organizationId parameter" },
			{ status: 400 },
		);
	}

	// Get user from database
	const user = await db.query.users.findFirst({
		where: eq(users.clerkId, clerkUserId),
	});

	if (!user) {
		return Response.json({ error: "User not found" }, { status: 404 });
	}

	// Verify user is a member of the organization
	const membership = await db.query.organizationMembers.findFirst({
		where: and(
			eq(organizationMembers.organizationId, organizationId),
			eq(organizationMembers.userId, user.id),
		),
	});

	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	// Build state parameter (will be verified in callback)
	const state = Buffer.from(
		JSON.stringify({
			organizationId,
			userId: user.id,
		}),
	).toString("base64url");

	// Build Linear OAuth URL
	const redirectUri = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/callback`;
	const linearAuthUrl = new URL("https://linear.app/oauth/authorize");
	linearAuthUrl.searchParams.set("client_id", env.LINEAR_CLIENT_ID);
	linearAuthUrl.searchParams.set("redirect_uri", redirectUri);
	linearAuthUrl.searchParams.set("response_type", "code");
	linearAuthUrl.searchParams.set("scope", "read,write,issues:create");
	linearAuthUrl.searchParams.set("state", state);

	return Response.redirect(linearAuthUrl.toString());
}
