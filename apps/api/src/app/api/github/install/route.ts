import { auth } from "@superset/auth/server";
import { findOrgMembership } from "@superset/db/utils";

import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

export async function GET(request: Request) {
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

	if (!env.GH_APP_ID) {
		return Response.json(
			{ error: "GitHub App not configured" },
			{ status: 500 },
		);
	}

	const state = createSignedState({
		organizationId,
		userId: session.user.id,
	});

	const installUrl = new URL(
		"https://github.com/apps/superset-app/installations/new",
	);
	installUrl.searchParams.set("state", state);
	installUrl.searchParams.set(
		"redirect_url",
		`${env.NEXT_PUBLIC_API_URL}/api/github/callback`,
	);

	return Response.redirect(installUrl.toString());
}
