import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

/**
 * Starts connecting a member's own GitHub account through the GitHub App's
 * user authorization. This is the App's OAuth client, not sign-in's: the
 * resulting token is bounded by the installation's permissions ∩ this
 * person's access, and connecting is a consent of its own.
 */
export async function GET(request: Request) {
	if (!env.GH_APP_CLIENT_ID || !env.GH_APP_CLIENT_SECRET) {
		return Response.json(
			{ error: "GitHub account connections are not configured" },
			{ status: 503 },
		);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
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

	const membership = await findOrgMembership({
		userId: session.user.id,
		organizationId,
	});
	if (!membership) {
		return Response.json(
			{ error: "User is not a member of this organization" },
			{ status: 403 },
		);
	}

	const state = createSignedState({ organizationId, userId: session.user.id });

	// No `scope`: a GitHub App's user token carries the App's permissions,
	// narrowed to what this person can reach. There is nothing to ask for.
	const authUrl = new URL("https://github.com/login/oauth/authorize");
	authUrl.searchParams.set("client_id", env.GH_APP_CLIENT_ID);
	authUrl.searchParams.set(
		"redirect_uri",
		`${env.NEXT_PUBLIC_API_URL}/api/integrations/github/user/callback`,
	);
	authUrl.searchParams.set("state", state);

	return Response.redirect(authUrl.toString());
}
